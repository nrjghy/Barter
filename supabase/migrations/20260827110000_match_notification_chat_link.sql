-- Adds an email CTA link ("Open chat") to match notifications, same
-- actionPath/actionLabel convention already used by listing_expiry_reminder
-- in 20260804082826_inactivity_archive_functions.sql. Purely additive to
-- the existing data jsonb (connectionId stays for in-app tap-to-navigate,
-- unaffected). No other logic in this function changes.

CREATE OR REPLACE FUNCTION public.check_and_create_match(responder_user_id uuid, target_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  target_item_user_id uuid;
  target_item_title text;
  responder_item_id uuid;
  responder_item_title text;
  target_username text;
  responder_username text;
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

  select user_id, title into target_item_user_id, target_item_title
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

  select i.id, i.title into responder_item_id, responder_item_title
  from items i
  join responses r on r.item_id = i.id
  where i.user_id = responder_user_id
    and i.is_active = true
    and r.user_id = target_item_user_id
    and r.direction = 'like'
  order by r.created_at desc
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

  select coalesce(username, 'they') into target_username from users where id = target_item_user_id;
  select coalesce(username, 'they') into responder_username from users where id = responder_user_id;
  target_item_title := coalesce(target_item_title, 'an item');
  responder_item_title := coalesce(responder_item_title, 'an item');

  if is_new_connection then
    insert into notifications (user_id, type, title, content, data)
    values
      (target_item_user_id, 'match', 'It''s a Match!',
       responder_username || ' liked your ''' || target_item_title || '''! You''re a match, start chatting now.',
       jsonb_build_object('connectionId', the_connection_id, 'actionPath', '/chat/' || the_connection_id, 'actionLabel', 'Open chat')),
      (responder_user_id, 'match', 'It''s a Match!',
       target_username || ' liked your ''' || responder_item_title || '''! You''re a match, start chatting now.',
       jsonb_build_object('connectionId', the_connection_id, 'actionPath', '/chat/' || the_connection_id, 'actionLabel', 'Open chat'));

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
       responder_username || ' also liked your ''' || target_item_title || '''! Check your chat for the new match.',
       jsonb_build_object('connectionId', the_connection_id, 'actionPath', '/chat/' || the_connection_id, 'actionLabel', 'Open chat')),
      (responder_user_id, 'match', 'Another Mutual Like',
       target_username || ' also liked your ''' || responder_item_title || '''! Check your chat for the new match.',
       jsonb_build_object('connectionId', the_connection_id, 'actionPath', '/chat/' || the_connection_id, 'actionLabel', 'Open chat'));

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
$function$
;
