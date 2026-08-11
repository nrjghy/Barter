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
  else
    insert into notifications (user_id, type, title, content, data)
    values
      (lister_user_id, 'match', 'More interest in your giveaways',
       'Someone is interested in another one of your items. Check your chat.',
       jsonb_build_object('connectionId', the_connection_id)),
      (interested_user_id, 'match', 'New item in your chat',
       'You expressed interest in another item with an existing connection.',
       jsonb_build_object('connectionId', the_connection_id));
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

REVOKE EXECUTE ON FUNCTION public.create_giveaway_connection(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_giveaway_connection(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_response_optimized(user_uuid uuid, target_item_id uuid, response_direction text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  target_item_user_id uuid;
  target_item_is_system boolean := false;
  target_item_listing_type text;
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

  select i.user_id, u.is_system, i.listing_type
  into target_item_user_id, target_item_is_system, target_item_listing_type
  from items i
  join users u on u.id = i.user_id
  where i.id = target_item_id and i.is_active = true;

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

  if response_direction = 'like' and target_item_user_id is not null and target_item_is_system then
    return jsonb_build_object(
      'success', true,
      'isSystemItem', true,
      'isGiveaway', false,
      'matchCheckNeeded', false,
      'giveawayConnectionNeeded', false,
      'targetItemUserId', target_item_user_id
    );
  end if;

  if response_direction = 'like' and target_item_user_id is not null and target_item_listing_type = 'giveaway' then
    return jsonb_build_object(
      'success', true,
      'isGiveaway', true,
      'matchCheckNeeded', false,
      'giveawayConnectionNeeded', true,
      'targetItemUserId', target_item_user_id
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'isGiveaway', false,
    'matchCheckNeeded', response_direction = 'like' and target_item_user_id is not null,
    'giveawayConnectionNeeded', false,
    'targetItemUserId', target_item_user_id
  );
end;
$function$;
