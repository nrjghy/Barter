-- =============================================================================
-- Barter: complete_trade RPC (draft, for review only, do not run yet)
--
-- Context: Mark Trade Complete needs to mark BOTH people's items as
-- traded, but items' RLS only lets an owner update their own row.
-- Whoever confirms the trade cannot directly update the other
-- participant's item via a plain client call -- the same reason
-- check_and_create_match/record_response_optimized had to be RPCs
-- rather than plain client-side inserts.
--
-- Style notes, matched deliberately to check_and_create_match's existing
-- convention rather than introducing a new one:
-- - Returns jsonb with an 'error' key for expected/handled failures,
--   rather than raising a hard Postgres exception. The calling code
--   should check for that key, not wrap the call in a try/catch
--   expecting a thrown error.
-- - Parameter names use a descriptive prefix word (for_connection_id,
--   traded_item_ids) rather than bare column names, and local variables
--   use a "the_" prefix (the_user_id_1, the_dispute_deadline, etc.),
--   matching check_and_create_match's own the_connection_id/the_interest_id
--   locals. This isn't just style: several of these names are otherwise
--   identical to real column names on tables this function queries
--   (trade_completions.connection_id, trade_completions.dispute_deadline),
--   and PL/pgSQL will happily let a bare-named parameter or local shadow
--   a column of the same name in ways that are easy to get subtly wrong.
--
-- One deliberate deviation from the existing RPCs, flagged rather than
-- silently added: this includes `set search_path = public`, which
-- check_and_create_match/record_response_optimized don't have. It's a
-- standard hardening step for SECURITY DEFINER functions (prevents a
-- malicious search_path from shadowing table/function names), worth
-- doing here and arguably worth retrofitting onto the other two RPCs
-- at some point, not done as part of this migration.
--
-- What this does, in one transaction:
-- 1. Verifies the caller is actually a participant in the connection,
--    and that the connection is active.
-- 2. Verifies every selected item belongs to one of the two
--    participants and is currently 'active' -- re-checked here, not
--    just trusted from the client, so a race (e.g. the other person
--    cancelled an item between opening the picker and confirming)
--    fails cleanly instead of silently completing a trade on a
--    no-longer-available item.
-- 3. Inserts the trade_completions row (dispute_deadline comes from
--    that table's own default, now() + 7 days) and the
--    trade_completion_items rows.
-- 4. Updates every selected item to status='traded', is_active=false.
-- 5. Inserts a system message into the thread naming whoever is NOT
--    completing the trade (they're the one who can dispute), since a
--    single stored message has to read correctly for both participants,
--    not just whoever clicked confirm.
--
-- Deliberately NOT included here (separate, already-tracked task):
-- notifying *other, unrelated* connections that also reference one of
-- these items. The direct connection partner gets the in-thread system
-- message here; the cross-connection notification is its own item.
-- =============================================================================

create function complete_trade(for_connection_id uuid, traded_item_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  the_user_id_1 uuid;
  the_user_id_2 uuid;
  the_connection_status text;
  the_caller_id uuid := auth.uid();
  the_other_user_id uuid;
  the_other_username text;
  the_trade_completion_id uuid;
  the_dispute_deadline timestamptz;
  the_item_count int;
  the_valid_item_count int;
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  if traded_item_ids is null or array_length(traded_item_ids, 1) is null or array_length(traded_item_ids, 1) = 0 then
    return jsonb_build_object('error', 'At least one item must be selected');
  end if;

  select user_id_1, user_id_2, status
    into the_user_id_1, the_user_id_2, the_connection_status
    from connections
    where id = for_connection_id;

  if the_user_id_1 is null then
    return jsonb_build_object('error', 'Connection not found');
  end if;

  if the_caller_id not in (the_user_id_1, the_user_id_2) then
    return jsonb_build_object('error', 'Not a participant in this connection');
  end if;

  if the_connection_status <> 'active' then
    return jsonb_build_object('error', 'Connection is not active');
  end if;

  the_other_user_id := case when the_caller_id = the_user_id_1 then the_user_id_2 else the_user_id_1 end;

  select count(*) into the_item_count from unnest(traded_item_ids);

  select count(*) into the_valid_item_count
    from items i
    where i.id = any(traded_item_ids)
      and i.user_id in (the_user_id_1, the_user_id_2)
      and i.status = 'active';

  if the_valid_item_count <> the_item_count then
    return jsonb_build_object(
      'error',
      'One or more selected items are invalid, not owned by a connection participant, or no longer active'
    );
  end if;

  insert into trade_completions (connection_id, completed_by)
    values (for_connection_id, the_caller_id)
    returning id, dispute_deadline into the_trade_completion_id, the_dispute_deadline;

  insert into trade_completion_items (trade_completion_id, item_id)
    select the_trade_completion_id, traded_item_id from unnest(traded_item_ids) as traded_item_id;

  update items
    set status = 'traded', is_active = false, updated_at = now()
    where id = any(traded_item_ids);

  select username into the_other_username from users where id = the_other_user_id;

  insert into messages (connection_id, sender_id, content, message_type, is_read)
    values (
      for_connection_id,
      the_caller_id,
      'Trade marked complete. ' || coalesce(the_other_username, 'The other participant') || ' has until ' ||
        to_char(the_dispute_deadline, 'FMMonth FMDD, YYYY') || ' to dispute.',
      'system',
      false
    );

  return jsonb_build_object(
    'tradeCompletionId', the_trade_completion_id,
    'disputeDeadline', the_dispute_deadline
  );
end;
$$;

grant execute on function complete_trade(uuid, uuid[]) to authenticated;
