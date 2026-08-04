-- =============================================================================
-- Barter: file_trade_dispute RPC (sync only: applied directly to Barter2 via
-- Supabase MCP in a planning chat; this file brings version control back in
-- line with what's already live)
--
-- Context: PRD §10 — the participant who did NOT mark a trade complete gets
-- a window (trade_completions.dispute_deadline) to dispute it. This has to
-- be an RPC rather than a plain client update: trade_completions no longer
-- has an open UPDATE policy (20260804074040_trade_dispute_schema.sql), and
-- the eligibility rules here (must be a participant, must NOT be
-- completed_by, not already disputed, before the deadline) need to be
-- enforced server-side, not trusted from the client.
--
-- Style/grant conventions matched deliberately to complete_trade and
-- check_and_create_match: jsonb 'error' key for expected/handled failures
-- rather than a raised exception; set search_path = public on the SECURITY
-- DEFINER function; explicit revoke-from-public/anon + grant-to-authenticated
-- rather than relying on Postgres's default EXECUTE-to-PUBLIC.
--
-- Confirmed live via pg_get_functiondef(file_trade_dispute) and
-- information_schema.role_routine_grants before writing this file;
-- reproduced verbatim below.
-- =============================================================================

create function file_trade_dispute(p_trade_completion_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  the_caller_id uuid := auth.uid();
  the_connection_id uuid;
  the_user_id_1 uuid;
  the_user_id_2 uuid;
  the_completed_by uuid;
  the_disputed_at timestamptz;
  the_dispute_deadline timestamptz;
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  select tc.connection_id, tc.completed_by, tc.disputed_at, tc.dispute_deadline
    into the_connection_id, the_completed_by, the_disputed_at, the_dispute_deadline
    from trade_completions tc
    where tc.id = p_trade_completion_id;

  if the_connection_id is null then
    return jsonb_build_object('error', 'Trade completion not found');
  end if;

  select user_id_1, user_id_2 into the_user_id_1, the_user_id_2
    from connections where id = the_connection_id;

  if the_caller_id not in (the_user_id_1, the_user_id_2) then
    return jsonb_build_object('error', 'Not a participant in this connection');
  end if;

  if the_caller_id = the_completed_by then
    return jsonb_build_object('error', 'Only the other participant can dispute a trade completion');
  end if;

  if the_disputed_at is not null then
    return jsonb_build_object('error', 'This trade has already been disputed');
  end if;

  if now() >= the_dispute_deadline then
    return jsonb_build_object('error', 'The dispute window for this trade has closed');
  end if;

  update trade_completions
    set disputed_at = now(),
        disputed_by = the_caller_id,
        dispute_reason = p_reason
    where id = p_trade_completion_id;

  insert into messages (connection_id, sender_id, content, message_type, is_read)
    values (
      the_connection_id,
      the_caller_id,
      'Trade completion disputed. This will be reviewed by a moderator.',
      'system',
      false
    );

  insert into notifications (user_id, type, title, content, data)
    values (
      the_completed_by,
      'trade_dispute',
      'Trade completion disputed',
      'The other participant disputed a trade you marked complete.',
      jsonb_build_object('tradeCompletionId', p_trade_completion_id, 'connectionId', the_connection_id)
    );

  return jsonb_build_object(
    'tradeCompletionId', p_trade_completion_id,
    'disputedAt', now()
  );
end;
$$;

revoke all on function file_trade_dispute(uuid, text) from public;
revoke all on function file_trade_dispute(uuid, text) from anon;

grant execute on function file_trade_dispute(uuid, text) to authenticated;
