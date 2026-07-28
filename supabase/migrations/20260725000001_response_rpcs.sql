-- =============================================================================
-- Barter: response/connection RPC rewrite (draft, for review only, do not run
-- yet)
--
-- Follow-up to 20260725000000_connection_model.sql. That migration renamed
-- swipes -> responses (with pass/like direction values) and replaced matches
-- with the four-table connection model, but deliberately left
-- record_swipe_optimized / check_and_create_match untouched so the two
-- changes could be reviewed independently. Run this only after
-- 20260725000000 has been applied — both functions below reference
-- `responses` and `connections`, which don't exist before that point.
--
-- DECIDED (see chat discussion):
--   - record_swipe_optimized is renamed to record_response_optimized;
--     check_and_create_match keeps its name (signature changes: the
--     is_super_like param is dropped, Super Like is gone).
--   - A shared sort_user_pair helper normalizes (user_id_1, user_id_2)
--     ordering for anything touching `connections`, rather than each caller
--     duplicating the least/greatest logic.
--   - check_and_create_match always records a connection_item_interests row
--     for the specific item pair, whether or not the connection itself is
--     new, and always notifies both users — wording differs for "brand-new
--     connection" vs. "another mutual like on an existing connection".
--   - Both the connections insert and the connection_item_interests insert
--     use INSERT ... ON CONFLICT ... RETURNING rather than check-then-insert,
--     so concurrent/retried calls can't crash on the underlying unique
--     constraints. A retried call that lands on a connection_item_interests
--     row that already exists is treated as a genuine no-op: it returns the
--     existing result without sending a second notification for an event
--     that already happened.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. sort_user_pair — shared helper for anything that checks against or
--    inserts into `connections`, so the user_id_1 < user_id_2 ordering rule
--    (see connections_user_order in 20260725000000) is enforced in one place
--    rather than duplicated per caller.
-- -----------------------------------------------------------------------------
create or replace function sort_user_pair(user_a uuid, user_b uuid)
returns table(user_id_1 uuid, user_id_2 uuid)
language sql
immutable
as $$
  select least(user_a, user_b), greatest(user_a, user_b);
$$;

-- -----------------------------------------------------------------------------
-- 2. record_response_optimized — renamed from record_swipe_optimized,
--    updated for the responses table and pass/like direction values (param
--    renamed response_direction to match). Behavior is otherwise unchanged
--    from the live version, including the system-item bypass branch (not
--    part of this rewrite's scope).
-- -----------------------------------------------------------------------------
drop function if exists record_swipe_optimized(uuid, uuid, text);

create function record_response_optimized(user_uuid uuid, target_item_id uuid, response_direction text)
returns jsonb
language plpgsql
security definer
as $$
declare
  target_item_user_id uuid;
  target_item_is_system boolean := false;
begin
  if response_direction not in ('pass', 'like') then
    return jsonb_build_object('error', 'Invalid response direction');
  end if;

  if not exists (select 1 from users where id = user_uuid) then
    return jsonb_build_object('error', 'User not found');
  end if;

  insert into responses (user_id, item_id, direction)
  values (user_uuid, target_item_id, response_direction)
  on conflict (user_id, item_id) do nothing;

  select i.user_id, u.is_system
  into target_item_user_id, target_item_is_system
  from items i
  join users u on u.id = i.user_id
  where i.id = target_item_id and i.is_active = true;

  if response_direction = 'like' and target_item_user_id is not null and target_item_is_system then
    return jsonb_build_object(
      'success', true,
      'isSystemItem', true,
      'matchCheckNeeded', false,
      'targetItemUserId', target_item_user_id
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'matchCheckNeeded', response_direction = 'like' and target_item_user_id is not null,
    'targetItemUserId', target_item_user_id
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. check_and_create_match — rewritten for the connection model. Name is
--    unchanged per decision, but the signature drops is_super_like (Super
--    Like is removed entirely) and the body now targets connections /
--    connection_item_interests instead of matches.
-- -----------------------------------------------------------------------------
drop function if exists check_and_create_match(uuid, uuid, boolean);

create function check_and_create_match(swiper_user_id uuid, target_item_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  target_item_user_id uuid;
  swiper_item_id uuid;
  sorted_user_id_1 uuid;
  sorted_user_id_2 uuid;
  the_connection_id uuid;
  the_interest_id uuid;
  is_new_connection boolean;
begin
  select user_id into target_item_user_id
  from items
  where id = target_item_id and is_active = true;

  if target_item_user_id is null then
    return jsonb_build_object('error', 'Target item not found or inactive');
  end if;

  -- Find a mutual like: an active item of the swiper's that the target
  -- item's owner has already liked.
  select i.id into swiper_item_id
  from items i
  join responses r on r.item_id = i.id
  where i.user_id = swiper_user_id
    and i.is_active = true
    and r.user_id = target_item_user_id
    and r.direction = 'like'
  limit 1;

  if swiper_item_id is null then
    return jsonb_build_object('matchCreated', false, 'reason', 'No mutual like found');
  end if;

  select user_id_1, user_id_2 into sorted_user_id_1, sorted_user_id_2
  from sort_user_pair(swiper_user_id, target_item_user_id);

  -- Atomic upsert-or-fetch: avoids a check-then-insert race where two
  -- concurrent calls both see "no connection" and both try to create one.
  -- If this insert loses the race, the conflicting row is guaranteed to
  -- already be committed, so the fallback SELECT below cannot come up empty.
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

  -- Same atomic pattern for the item-pair interest row. Unlike the
  -- connection insert, a conflict here means this exact interest was already
  -- recorded (e.g. a retried call) — genuinely nothing new happened, so skip
  -- the notification block entirely and return the existing result rather
  -- than sending a second notification for an event that already fired.
  insert into connection_item_interests (connection_id, item_id_1, item_id_2)
  values (the_connection_id, swiper_item_id, target_item_id)
  on conflict (connection_id, item_id_1, item_id_2) do nothing
  returning id into the_interest_id;

  if the_interest_id is null then
    return jsonb_build_object(
      'matchCreated', true,
      'connectionId', the_connection_id,
      'isNewConnection', is_new_connection,
      'swiperItemId', swiper_item_id,
      'targetItemId', target_item_id
    );
  end if;

  if is_new_connection then
    insert into notifications (user_id, type, title, content, data)
    values
      (target_item_user_id, 'match', 'It''s a Match!',
       'You both liked each other''s items! Start chatting now.',
       jsonb_build_object('connectionId', the_connection_id)),
      (swiper_user_id, 'match', 'It''s a Match!',
       'You both liked each other''s items! Start chatting now.',
       jsonb_build_object('connectionId', the_connection_id));
  else
    insert into notifications (user_id, type, title, content, data)
    values
      (target_item_user_id, 'match', 'Another Mutual Like',
       'You both liked another item! Check your chat for the new item.',
       jsonb_build_object('connectionId', the_connection_id)),
      (swiper_user_id, 'match', 'Another Mutual Like',
       'You both liked another item! Check your chat for the new item.',
       jsonb_build_object('connectionId', the_connection_id));
  end if;

  return jsonb_build_object(
    'matchCreated', true,
    'connectionId', the_connection_id,
    'isNewConnection', is_new_connection,
    'swiperItemId', swiper_item_id,
    'targetItemId', target_item_id
  );
end;
$$;
