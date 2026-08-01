-- =============================================================================
-- Barter: close access-control gaps on check_and_create_match
--
-- Context: check_and_create_match predates the pattern -- established with
-- complete_trade (20260730201108) and notify_item_cancelled/
-- notify_connections_item_unavailable -- of explicitly revoking the default
-- EXECUTE-to-PUBLIC grant on new SECURITY DEFINER functions. It never got
-- that treatment, and a security sweep found two real gaps, not just the
-- missing revoke:
--
-- 1. No auth check at all. Confirmed via aclexplode that PUBLIC and anon
--    both held EXECUTE, meaning an unauthenticated caller could invoke this
--    directly with any responder_user_id. Fix follows complete_trade's own
--    proven pattern of a separate `is null` check before the comparison,
--    rather than a bare `auth.uid() != responder_user_id`: in plpgsql, `if
--    NULL then` is false, not true, so a bare `!=` against a null auth.uid()
--    (any unauthenticated context that somehow still reaches this function)
--    would silently skip the unauthorized branch instead of catching it.
--
-- 2. The "mutual like" check only ever verified the reverse half: that the
--    target item's owner had already liked one of the responder's active
--    items. It never confirmed the responder actually liked target_item_id.
--    Even with the auth fix in place, an authenticated user could call this
--    with an item they never liked, as long as the target's owner happened
--    to have liked something else of theirs -- forcing a connection into
--    existence off someone else's pre-existing one-directional like rather
--    than a genuine mutual match. Fixed by requiring an explicit
--    responder-liked-target-item row before doing the reverse-like lookup.
--
-- Both checks are purely additive against what the client already sends --
-- the app always passes the calling user's own id -- so legitimate use is
-- unaffected; verified end-to-end via direct RPC regression tests (normal
-- like -> match flow, and a rejected impersonation attempt) rather than by
-- code reading alone.
--
-- Grant fix matches complete_trade_revoke_public exactly: revoke from
-- public and anon, (re)grant to authenticated only. postgres/service_role
-- retain EXECUTE the same way complete_trade's do -- ownership and the
-- service role's privileges, not an explicit grant.
-- =============================================================================

create or replace function check_and_create_match(responder_user_id uuid, target_item_id uuid)
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
  if auth.uid() is null or auth.uid() != responder_user_id then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  select user_id into target_item_user_id
  from items
  where id = target_item_id and is_active = true;

  if target_item_user_id is null then
    return jsonb_build_object('error', 'Target item not found or inactive');
  end if;

  if not exists (
    select 1 from responses
    where user_id = responder_user_id
      and item_id = target_item_id
      and direction = 'like'
  ) then
    return jsonb_build_object('error', 'You have not liked this item');
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
  -- recorded (e.g. a retried call) -- genuinely nothing new happened, so skip
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

revoke all on function check_and_create_match(uuid, uuid) from public;
revoke all on function check_and_create_match(uuid, uuid) from anon;

grant execute on function check_and_create_match(uuid, uuid) to authenticated;
