-- Mirrors the match-notification CTA link fix for the giveaway path:
-- create_giveaway_connection reuses the 'match' notification type (PRD §7)
-- but was never given the actionPath/actionLabel CTA added to
-- check_and_create_match, so giveaway match emails had no working "Open
-- chat" button. Purely additive to the existing data jsonb.

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

  select *
  into the_connection_id, is_new_connection, already_registered
  from public._bootstrap_one_directional_connection(interested_user_id, lister_user_id, giveaway_item_id);

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
       jsonb_build_object('connectionId', the_connection_id, 'actionPath', '/chat/' || the_connection_id, 'actionLabel', 'Open chat')),
      (interested_user_id, 'match', 'You''re connected!',
       'You''re connected with ' || lister_username || ' over ''' || item_title || '''. Start chatting now.',
       jsonb_build_object('connectionId', the_connection_id, 'actionPath', '/chat/' || the_connection_id, 'actionLabel', 'Open chat'));

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
       jsonb_build_object('connectionId', the_connection_id, 'actionPath', '/chat/' || the_connection_id, 'actionLabel', 'Open chat')),
      (interested_user_id, 'match', 'New item in your chat',
       'You expressed interest in ' || lister_username || '''s ''' || item_title || '''. Check your chat.',
       jsonb_build_object('connectionId', the_connection_id, 'actionPath', '/chat/' || the_connection_id, 'actionLabel', 'Open chat'));

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
