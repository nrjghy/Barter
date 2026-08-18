-- Extends notifications_type_check (live CHECK constraint) to allow the new
-- 'like' notification type below. New migration on top of the live
-- constraint definition rather than editing whichever old migration file
-- first created it.
ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'match', 'message', 'trade_completed', 'review', 'system', 'item_unavailable',
    'review_reminder', 'issue_status', 'admin_daily_summary', 'trade_dispute',
    'listing_expiry_reminder', 'pending_approval', 'product_update',
    'offer_received', 'offer_agreed', 'offer_countered', 'offer_withdrawn',
    'offer_expiring_soon', 'offer_auto_completing_soon', 'offer_expired',
    'like'
  ]::text[]));

-- Adds an in-app-only reciprocity notification: the item owner is told
-- someone liked their item, nudging them to go like back and form a match.
-- Based on the LIVE definition (confirmed via Supabase MCP) -- reuses
-- target_item_is_system/target_item_is_curator/target_item_user_id from the
-- single SELECT that already exists, and inserted_id IS NOT NULL (already
-- computed for the daily_swipes guard a few lines below) as the "did this
-- like actually get newly recorded" signal, so an undo + re-like doesn't
-- double-notify and a duplicate like (already-liked item) doesn't notify at
-- all. Deliberately placed before the is_system/is_curator/giveaway
-- branches so it still fires on a giveaway like from a real user -- only
-- system and curator owners are excluded (curator likes already branch to
-- their own connection flow elsewhere).
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
      jsonb_build_object('likerUserId', user_uuid, 'itemId', target_item_id)
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
