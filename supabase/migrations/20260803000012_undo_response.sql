-- Real, server-side Undo for a Like/Not-for-me action (previously the
-- Dashboard.tsx Undo button only manipulated client-side state -- the
-- underlying responses row was permanent, since record_response_optimized
-- inserts with ON CONFLICT (user_id, item_id) DO NOTHING). Refuses to undo a
-- 'like' if it has already resulted in a connection -- reversing an
-- already-formed match/connection is a materially different, more
-- consequential action (that's what ending/blocking a connection is for),
-- not something a quick Undo tap should silently do.
--
-- Race-condition note: check_and_create_match runs as an unawaited
-- background call immediately after a like is recorded (confirmed via
-- swipeService.ts), so a match can already exist by the time a person taps
-- Undo. Both functions take the same transaction-scoped advisory lock, keyed
-- on (user_id, item_id), before doing any reads that inform a write -- this
-- serializes the two operations for the same response so they can't
-- interleave, without changing check_and_create_match's existing behavior at
-- all for the normal, non-racing case.

CREATE OR REPLACE FUNCTION public.undo_response(user_uuid uuid, target_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  existing_direction text;
  match_already_exists boolean;
  deleted_id uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != user_uuid THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(user_uuid::text), hashtext(target_item_id::text));

  SELECT direction INTO existing_direction
  FROM responses
  WHERE user_id = user_uuid AND item_id = target_item_id;

  IF existing_direction IS NULL THEN
    RETURN jsonb_build_object('error', 'No response found to undo');
  END IF;

  IF existing_direction = 'like' THEN
    SELECT EXISTS (
      SELECT 1
      FROM connection_item_interests cii
      JOIN connections c ON c.id = cii.connection_id
      WHERE (c.user_id_1 = user_uuid OR c.user_id_2 = user_uuid)
        AND (cii.item_id_1 = target_item_id OR cii.item_id_2 = target_item_id)
    ) INTO match_already_exists;

    IF match_already_exists THEN
      RETURN jsonb_build_object('error', 'Already matched, cannot undo', 'alreadyMatched', true);
    END IF;
  END IF;

  DELETE FROM responses
  WHERE user_id = user_uuid AND item_id = target_item_id
  RETURNING id INTO deleted_id;

  IF deleted_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Could not undo, please try again');
  END IF;

  IF existing_direction = 'like' THEN
    UPDATE users SET daily_swipes = GREATEST(daily_swipes - 1, 0) WHERE id = user_uuid;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- Additive change to the existing, already-tested check_and_create_match:
-- acquire the same advisory lock before it reads anything that informs its
-- own writes. Everything else is unchanged from the live function's
-- existing, already-committed behavior.
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
$function$;

REVOKE EXECUTE ON FUNCTION public.undo_response(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.undo_response(uuid, uuid) FROM anon;
