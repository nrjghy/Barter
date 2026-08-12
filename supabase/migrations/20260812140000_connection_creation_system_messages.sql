CREATE OR REPLACE FUNCTION public.check_and_create_match(responder_user_id uuid, target_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  target_item_user_id uuid;
  responder_item_id uuid;
  sorted_user_id_1 uuid;
  sorted_user_id_2 uuid;
  the_connection_id uuid;
  the_interest_id uuid;
  is_new_connection boolean;
begin
  if auth.uid() is null or auth.uid() != responder_user_id then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  perform pg_advisory_xact_lock(hashtext(responder_user_id::text), hashtext(target_item_id::text));

  select user_id into target_item_user_id
  from items
  where id = target_item_id and is_active = true;

  if target_item_user_id is null then
    return jsonb_build_object('error', 'Target item not found or inactive');
  end if;

  if exists (
    select 1 from user_blocks ub
    where (ub.blocker_id = responder_user_id and ub.blocked_id = target_item_user_id)
       or (ub.blocker_id = target_item_user_id and ub.blocked_id = responder_user_id)
  ) then
    return jsonb_build_object('matchCreated', false, 'reason', 'blocked');
  end if;

  if not exists (
    select 1 from responses
    where user_id = responder_user_id
      and item_id = target_item_id
      and direction = 'like'
  ) then
    return jsonb_build_object('error', 'You have not liked this item');
  end if;

  select i.id into responder_item_id
  from items i
  join responses r on r.item_id = i.id
  where i.user_id = responder_user_id
    and i.is_active = true
    and r.user_id = target_item_user_id
    and r.direction = 'like'
  limit 1;

  if responder_item_id is null then
    return jsonb_build_object('matchCreated', false, 'reason', 'No mutual like found');
  end if;

  select user_id_1, user_id_2 into sorted_user_id_1, sorted_user_id_2
  from sort_user_pair(responder_user_id, target_item_user_id);

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

  insert into connection_item_interests (connection_id, item_id_1, item_id_2)
  values (the_connection_id, responder_item_id, target_item_id)
  on conflict (connection_id, item_id_1, item_id_2) do nothing
  returning id into the_interest_id;

  if the_interest_id is null then
    return jsonb_build_object(
      'matchCreated', true,
      'connectionId', the_connection_id,
      'isNewConnection', is_new_connection,
      'responderItemId', responder_item_id,
      'targetItemId', target_item_id
    );
  end if;

  if is_new_connection then
    insert into notifications (user_id, type, title, content, data)
    values
      (target_item_user_id, 'match', 'It''s a Match!',
       'You both liked each other''s items! Start chatting now.',
       jsonb_build_object('connectionId', the_connection_id)),
      (responder_user_id, 'match', 'It''s a Match!',
       'You both liked each other''s items! Start chatting now.',
       jsonb_build_object('connectionId', the_connection_id));

    insert into messages (connection_id, sender_id, content, message_type, is_read, data)
    values (
      the_connection_id,
      responder_user_id,
      'You matched! You both liked each other''s items.',
      'system',
      false,
      jsonb_build_object('connectionId', the_connection_id)
    );
  else
    insert into notifications (user_id, type, title, content, data)
    values
      (target_item_user_id, 'match', 'Another Mutual Like',
       'You both liked another item! Check your chat for the new item.',
       jsonb_build_object('connectionId', the_connection_id)),
      (responder_user_id, 'match', 'Another Mutual Like',
       'You both liked another item! Check your chat for the new item.',
       jsonb_build_object('connectionId', the_connection_id));

    insert into messages (connection_id, sender_id, content, message_type, is_read, data)
    values (
      the_connection_id,
      responder_user_id,
      'You both liked another item.',
      'system',
      false,
      jsonb_build_object('connectionId', the_connection_id)
    );
  end if;

  return jsonb_build_object(
    'matchCreated', true,
    'connectionId', the_connection_id,
    'isNewConnection', is_new_connection,
    'responderItemId', responder_item_id,
    'targetItemId', target_item_id
  );
end;
$function$;

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
  sorted_user_id_1 uuid;
  sorted_user_id_2 uuid;
  the_connection_id uuid;
  is_new_connection boolean;
  already_registered boolean;
begin
  if auth.uid() is null or auth.uid() != interested_user_id then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  perform pg_advisory_xact_lock(hashtext(interested_user_id::text), hashtext(giveaway_item_id::text));

  select user_id, listing_type, is_active
  into lister_user_id, item_listing_type, item_is_active
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

  select user_id_1, user_id_2 into sorted_user_id_1, sorted_user_id_2
  from sort_user_pair(interested_user_id, lister_user_id);

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
      and item_id_2 = giveaway_item_id
  ) into already_registered;

  if not already_registered then
    insert into connection_item_interests (connection_id, item_id_1, item_id_2)
    values (the_connection_id, null, giveaway_item_id);
  end if;

  if already_registered then
    return jsonb_build_object(
      'connectionCreated', true,
      'connectionId', the_connection_id,
      'isNewConnection', is_new_connection,
      'alreadyRegistered', true,
      'giveawayItemId', giveaway_item_id
    );
  end if;

  if is_new_connection then
    insert into notifications (user_id, type, title, content, data)
    values
      (lister_user_id, 'match', 'Interest in your giveaway',
       'Someone wants your giveaway item! Start chatting now.',
       jsonb_build_object('connectionId', the_connection_id)),
      (interested_user_id, 'match', 'You''re connected!',
       'You''re connected with the lister. Start chatting now.',
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
       'Someone is interested in another one of your items. Check your chat.',
       jsonb_build_object('connectionId', the_connection_id)),
      (interested_user_id, 'match', 'New item in your chat',
       'You expressed interest in another item with an existing connection.',
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
