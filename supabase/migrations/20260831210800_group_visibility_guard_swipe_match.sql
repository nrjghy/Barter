-- Groups feature: close a real security gap. record_response_optimized
-- and check_and_create_match are both SECURITY DEFINER, so they bypass
-- RLS entirely. Without this, an outsider could directly call the RPC
-- to like/pass a private group item they could never actually see in
-- their own feed. A privately-grouped item a caller can't see now
-- behaves exactly like an inactive item already did (response recorded
-- but orphaned, no notification, no match check) -- same existing
-- precedent, not a new behavior class.

CREATE OR REPLACE FUNCTION public.record_response_optimized(user_uuid uuid, target_item_id uuid, response_direction text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  target_item_user_id uuid;
  target_item_is_system boolean := false;
  target_item_is_curator boolean := false;
  target_item_listing_type text;
  target_item_title text;
  inserted_id uuid;
begin
  if auth.uid() is null or auth.uid() != user_uuid then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  if response_direction not in ('pass', 'like') then
    return jsonb_build_object('error', 'Invalid response direction');
  end if;

  if not exists (select 1 from users where id = user_uuid) then
    return jsonb_build_object('error', 'User not found');
  end if;

  if response_direction = 'like' and not public.can_user_swipe(user_uuid) then
    return jsonb_build_object('error', 'Daily swipe limit reached');
  end if;

  select i.user_id, u.is_system, u.is_curator, i.listing_type, i.title
  into target_item_user_id, target_item_is_system, target_item_is_curator, target_item_listing_type, target_item_title
  from items i
  join users u on u.id = i.user_id
  where i.id = target_item_id
    and i.is_active = true
    and (
      i.is_public = true
      or i.user_id = user_uuid
      or exists (
        select 1 from item_groups ig
        join group_memberships gm on gm.group_id = ig.group_id
        where ig.item_id = i.id and gm.user_id = user_uuid
      )
    );

  if response_direction = 'like' and target_item_user_id is not null and exists (
    select 1 from user_blocks ub
    where (ub.blocker_id = user_uuid and ub.blocked_id = target_item_user_id)
       or (ub.blocker_id = target_item_user_id and ub.blocked_id = user_uuid)
  ) then
    return jsonb_build_object('error', 'Cannot like an item from a blocked user');
  end if;

  insert into responses (user_id, item_id, direction)
  values (user_uuid, target_item_id, response_direction)
  on conflict (user_id, item_id) do nothing
  returning id into inserted_id;

  if response_direction = 'like' and inserted_id is not null then
    update users set daily_swipes = daily_swipes + 1 where id = user_uuid;
  end if;

  if response_direction = 'like'
     and inserted_id is not null
     and target_item_user_id is not null
     and target_item_user_id != user_uuid
     and not target_item_is_system
     and not target_item_is_curator
  then
    insert into notifications (user_id, type, title, content, data)
    values (
      target_item_user_id,
      'like',
      'Someone liked your item',
      'Someone liked ''' || coalesce(target_item_title, 'an item') || '''' ||
        ' — check out their listings; a match needs you both to like each other''s items.',
      jsonb_build_object('likerUserId', user_uuid, 'itemId', target_item_id, 'actionPath', '/item/' || target_item_id, 'actionLabel', 'View item')
    );
  end if;

  if response_direction = 'like' and target_item_user_id is not null and target_item_is_system then
    return jsonb_build_object(
      'success', true,
      'isSystemItem', true,
      'isGiveaway', false,
      'matchCheckNeeded', false,
      'giveawayConnectionNeeded', false,
      'curatorConnectionNeeded', false,
      'targetItemUserId', target_item_user_id
    );
  end if;

  if response_direction = 'like' and target_item_user_id is not null and target_item_is_curator then
    return jsonb_build_object(
      'success', true,
      'isGiveaway', false,
      'matchCheckNeeded', false,
      'giveawayConnectionNeeded', false,
      'curatorConnectionNeeded', true,
      'targetItemUserId', target_item_user_id
    );
  end if;

  if response_direction = 'like' and target_item_user_id is not null and target_item_listing_type = 'giveaway' then
    return jsonb_build_object(
      'success', true,
      'isGiveaway', true,
      'matchCheckNeeded', false,
      'giveawayConnectionNeeded', true,
      'curatorConnectionNeeded', false,
      'targetItemUserId', target_item_user_id
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'isGiveaway', false,
    'matchCheckNeeded', response_direction = 'like' and target_item_user_id is not null,
    'giveawayConnectionNeeded', false,
    'curatorConnectionNeeded', false,
    'targetItemUserId', target_item_user_id
  );
end;
$function$;

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
  where id = target_item_id
    and is_active = true
    and (
      is_public = true
      or user_id = responder_user_id
      or exists (
        select 1 from item_groups ig
        join group_memberships gm on gm.group_id = ig.group_id
        where ig.item_id = items.id and gm.user_id = responder_user_id
      )
    );

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
$function$;
