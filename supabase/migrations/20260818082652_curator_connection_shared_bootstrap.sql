-- Shared "sort user pair, find-or-create connection, dedupe into
-- connection_item_interests" mechanics, extracted out of
-- create_giveaway_connection so create_curator_connection can reuse it too
-- (the two only share this bootstrapping step -- downstream behavior stays
-- separate: giveaway continues into a real claim/approve/trade-completion
-- lifecycle, curator terminates in an informational thread). Follows the
-- existing _offer_create_core/_complete_trade_core internal-helper
-- convention (underscore prefix, not exposed as a public entry point).
CREATE OR REPLACE FUNCTION public._bootstrap_item_interest_connection(p_interested_user_id uuid, p_lister_user_id uuid, p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  sorted_user_id_1 uuid;
  sorted_user_id_2 uuid;
  the_connection_id uuid;
  is_new_connection boolean;
  already_registered boolean;
begin
  perform pg_advisory_xact_lock(hashtext(p_interested_user_id::text), hashtext(p_item_id::text));

  select user_id_1, user_id_2 into sorted_user_id_1, sorted_user_id_2
  from sort_user_pair(p_interested_user_id, p_lister_user_id);

  insert into connections (user_id_1, user_id_2)
  values (sorted_user_id_1, sorted_user_id_2)
  on conflict (user_id_1, user_id_2) do nothing
  returning id into the_connection_id;

  if the_connection_id is not null then
    is_new_connection := true;
  else
    is_new_connection := false;
    select id into the_connection_id
    from connections
    where user_id_1 = sorted_user_id_1 and user_id_2 = sorted_user_id_2;
  end if;

  -- NOTE: connection_item_interests' UNIQUE constraint doesn't dedupe a NULL item_id_1,
  -- so this existence check does the dedup work an ON CONFLICT clause can't here.
  select exists (
    select 1 from connection_item_interests
    where connection_id = the_connection_id
      and item_id_1 is null
      and item_id_2 = p_item_id
  ) into already_registered;

  if not already_registered then
    insert into connection_item_interests (connection_id, item_id_1, item_id_2)
    values (the_connection_id, null, p_item_id);
  end if;

  return jsonb_build_object(
    'connectionId', the_connection_id,
    'isNewConnection', is_new_connection,
    'alreadyRegistered', already_registered
  );
end;
$function$;

-- Pure refactor -- external behavior/signature unchanged. Only the
-- sort/find-or-create/dedupe block is replaced with a call to the new
-- shared helper above.
CREATE OR REPLACE FUNCTION public.create_giveaway_connection(interested_user_id uuid, giveaway_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  lister_user_id uuid;
  item_listing_type text;
  item_is_active boolean;
  item_title text;
  lister_username text;
  interested_username text;
  bootstrap jsonb;
  the_connection_id uuid;
  is_new_connection boolean;
  already_registered boolean;
begin
  if auth.uid() is null or auth.uid() != interested_user_id then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  select user_id, listing_type, is_active, title
  into lister_user_id, item_listing_type, item_is_active, item_title
  from items
  where id = giveaway_item_id;

  if lister_user_id is null or item_is_active is not true then
    return jsonb_build_object('error', 'Item not found or inactive');
  end if;

  if item_listing_type != 'giveaway' then
    return jsonb_build_object('error', 'Item is not a giveaway listing');
  end if;

  if lister_user_id = interested_user_id then
    return jsonb_build_object('error', 'Cannot express interest in your own item');
  end if;

  if exists (
    select 1 from user_blocks ub
    where (ub.blocker_id = interested_user_id and ub.blocked_id = lister_user_id)
       or (ub.blocker_id = lister_user_id and ub.blocked_id = interested_user_id)
  ) then
    return jsonb_build_object('connectionCreated', false, 'reason', 'blocked');
  end if;

  if not exists (
    select 1 from responses
    where user_id = interested_user_id
      and item_id = giveaway_item_id
      and direction = 'like'
  ) then
    return jsonb_build_object('error', 'You have not expressed interest in this item');
  end if;

  bootstrap := public._bootstrap_item_interest_connection(interested_user_id, lister_user_id, giveaway_item_id);
  the_connection_id := (bootstrap ->> 'connectionId')::uuid;
  is_new_connection := (bootstrap ->> 'isNewConnection')::boolean;
  already_registered := (bootstrap ->> 'alreadyRegistered')::boolean;

  if already_registered then
    return jsonb_build_object(
      'connectionCreated', true,
      'connectionId', the_connection_id,
      'isNewConnection', is_new_connection,
      'alreadyRegistered', true,
      'giveawayItemId', giveaway_item_id
    );
  end if;

  select coalesce(username, 'the lister') into lister_username from users where id = lister_user_id;
  select coalesce(username, 'Someone') into interested_username from users where id = interested_user_id;
  item_title := coalesce(item_title, 'an item');

  if is_new_connection then
    insert into notifications (user_id, type, title, content, data)
    values
      (lister_user_id, 'match', 'Interest in your giveaway',
       interested_username || ' wants your ''' || item_title || '''! Start chatting now.',
       jsonb_build_object('connectionId', the_connection_id)),
      (interested_user_id, 'match', 'You''re connected!',
       'You''re connected with ' || lister_username || ' over ''' || item_title || '''. Start chatting now.',
       jsonb_build_object('connectionId', the_connection_id));

    insert into messages (connection_id, sender_id, content, message_type, is_read, data)
    values (
      the_connection_id,
      interested_user_id,
      'Connected over a giveaway item.',
      'system',
      false,
      jsonb_build_object('connectionId', the_connection_id)
    );
  else
    insert into notifications (user_id, type, title, content, data)
    values
      (lister_user_id, 'match', 'More interest in your giveaways',
       interested_username || ' is also interested in your ''' || item_title || '''. Check your chat.',
       jsonb_build_object('connectionId', the_connection_id)),
      (interested_user_id, 'match', 'New item in your chat',
       'You expressed interest in ' || lister_username || '''s ''' || item_title || '''. Check your chat.',
       jsonb_build_object('connectionId', the_connection_id));

    insert into messages (connection_id, sender_id, content, message_type, is_read, data)
    values (
      the_connection_id,
      interested_user_id,
      'Interested in another giveaway item.',
      'system',
      false,
      jsonb_build_object('connectionId', the_connection_id)
    );
  end if;

  return jsonb_build_object(
    'connectionCreated', true,
    'connectionId', the_connection_id,
    'isNewConnection', is_new_connection,
    'alreadyRegistered', false,
    'giveawayItemId', giveaway_item_id
  );
end;
$function$;

-- Now also reads the item's location for the automated first message, and
-- calls the shared bootstrap helper above instead of inlining the same
-- sort/find-or-create/dedupe block create_giveaway_connection has.
CREATE OR REPLACE FUNCTION public.create_curator_connection(interested_user_id uuid, curator_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  lister_user_id uuid;
  item_is_active boolean;
  item_title text;
  item_source_url text;
  item_location text;
  lister_is_curator boolean;
  lister_username text;
  interested_username text;
  bootstrap jsonb;
  the_connection_id uuid;
  is_new_connection boolean;
  already_registered boolean;
  message_content text;
begin
  if auth.uid() is null or auth.uid() != interested_user_id then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  select i.user_id, i.is_active, i.title, i.source_url, i.location, u.is_curator
  into lister_user_id, item_is_active, item_title, item_source_url, item_location, lister_is_curator
  from items i
  join users u on u.id = i.user_id
  where i.id = curator_item_id;

  if lister_user_id is null or item_is_active is not true then
    return jsonb_build_object('error', 'Item not found or inactive');
  end if;

  if lister_is_curator is not true then
    return jsonb_build_object('error', 'Item is not a curated listing');
  end if;

  if lister_user_id = interested_user_id then
    return jsonb_build_object('error', 'Cannot express interest in your own item');
  end if;

  if exists (
    select 1 from user_blocks ub
    where (ub.blocker_id = interested_user_id and ub.blocked_id = lister_user_id)
       or (ub.blocker_id = lister_user_id and ub.blocked_id = interested_user_id)
  ) then
    return jsonb_build_object('connectionCreated', false, 'reason', 'blocked');
  end if;

  if not exists (
    select 1 from responses
    where user_id = interested_user_id
      and item_id = curator_item_id
      and direction = 'like'
  ) then
    return jsonb_build_object('error', 'You have not expressed interest in this item');
  end if;

  bootstrap := public._bootstrap_item_interest_connection(interested_user_id, lister_user_id, curator_item_id);
  the_connection_id := (bootstrap ->> 'connectionId')::uuid;
  is_new_connection := (bootstrap ->> 'isNewConnection')::boolean;
  already_registered := (bootstrap ->> 'alreadyRegistered')::boolean;

  if already_registered then
    return jsonb_build_object(
      'connectionCreated', true,
      'connectionId', the_connection_id,
      'isNewConnection', is_new_connection,
      'alreadyRegistered', true,
      'curatorItemId', curator_item_id
    );
  end if;

  select coalesce(username, 'Barter Finds') into lister_username from users where id = lister_user_id;
  select coalesce(username, 'Someone') into interested_username from users where id = interested_user_id;
  item_title := coalesce(item_title, 'an item');

  -- The curator account still gets the standard notification -- that's the
  -- operator's signal to go look at the chat, unchanged from the
  -- giveaway/match pattern. The pilot user's copy deliberately avoids "It's
  -- a Match!" / "connected" language implying a live back-and-forth, since
  -- the curator account never replies.
  if is_new_connection then
    insert into notifications (user_id, type, title, content, data)
    values
      (lister_user_id, 'match', 'Interest in a curated listing',
       interested_username || ' is interested in your ''' || item_title || '''! Check the chat.',
       jsonb_build_object('connectionId', the_connection_id)),
      (interested_user_id, 'match', 'You''re connected!',
       'You''re connected with ' || lister_username || ' about a curated listing.',
       jsonb_build_object('connectionId', the_connection_id));
  else
    insert into notifications (user_id, type, title, content, data)
    values
      (lister_user_id, 'match', 'More interest in your curated listings',
       interested_username || ' is also interested in your ''' || item_title || '''. Check your chat.',
       jsonb_build_object('connectionId', the_connection_id)),
      (interested_user_id, 'match', 'New item in your chat',
       'You expressed interest in ' || lister_username || '''s ''' || item_title || '''. Check your chat.',
       jsonb_build_object('connectionId', the_connection_id));
  end if;

  -- If the item has no location on file, the "found in X" clause is
  -- dropped entirely rather than rendering a blank/"null" sentence.
  message_content := 'Thanks for your interest!' ||
    case when item_location is not null then ' This listing was found in ' || item_location || '.' else '' end ||
    ' It isn''t listed by a Barter user, so contact the original lister directly here to arrange it: ' ||
    coalesce(item_source_url, '') || ' (login required). Questions? Reply here, the Barter team reads these messages.';

  insert into messages (connection_id, sender_id, content, message_type, is_read, data)
  values (
    the_connection_id,
    lister_user_id,
    message_content,
    'system',
    false,
    jsonb_build_object('itemId', curator_item_id, 'sourceUrl', item_source_url)
  );

  return jsonb_build_object(
    'connectionCreated', true,
    'connectionId', the_connection_id,
    'isNewConnection', is_new_connection,
    'alreadyRegistered', false,
    'curatorItemId', curator_item_id
  );
end;
$function$;
