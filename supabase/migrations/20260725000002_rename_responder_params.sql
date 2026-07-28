-- =============================================================================
-- Barter: rename swiper_* naming leftover in check_and_create_match
--
-- Found during SQL-level testing of checkpoint 2: check_and_create_match's
-- parameter (swiper_user_id), internal variable (swiper_item_id), and return
-- key (swiperItemId) still used "swipe" terminology, missed in the
-- 20260725000001 rename pass since the function's own name didn't change.
-- Pure rename to match the responder/target naming already used elsewhere
-- (record_response_optimized's response_direction, this function's own
-- target_item_id/target_item_user_id) — no behavior change.
--
-- Confirmed via a full schema sweep this is the only remaining swipe/swiper
-- reference worth fixing here: can_user_swipe and reset_daily_swipes are
-- unrelated naming questions outside this rewrite's scope (the former is
-- actively called by current frontend code under that name; the latter
-- touches users.daily_swipes/last_swipe_date, not part of the connection
-- model), and handle_swipe_and_match is already-confirmed dead code, a drop
-- candidate rather than a rename candidate.
--
-- Note: this can't be a plain CREATE OR REPLACE — Postgres rejects renaming
-- an input parameter that way ("cannot change name of input parameter"),
-- confirmed by a first attempt at this migration failing with exactly that
-- error. The signature's types/count are unchanged, so an explicit drop
-- first is safe here the same way it was for the 20260725000001 renames.
-- =============================================================================
drop function if exists check_and_create_match(uuid, uuid);

create function check_and_create_match(responder_user_id uuid, target_item_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  target_item_user_id uuid;
  responder_item_id uuid;
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

  -- Find a mutual like: an active item of the responder's that the target
  -- item's owner has already liked.
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
  else
    insert into notifications (user_id, type, title, content, data)
    values
      (target_item_user_id, 'match', 'Another Mutual Like',
       'You both liked another item! Check your chat for the new item.',
       jsonb_build_object('connectionId', the_connection_id)),
      (responder_user_id, 'match', 'Another Mutual Like',
       'You both liked another item! Check your chat for the new item.',
       jsonb_build_object('connectionId', the_connection_id));
  end if;

  return jsonb_build_object(
    'matchCreated', true,
    'connectionId', the_connection_id,
    'isNewConnection', is_new_connection,
    'responderItemId', responder_item_id,
    'targetItemId', target_item_id
  );
end;
$$;
