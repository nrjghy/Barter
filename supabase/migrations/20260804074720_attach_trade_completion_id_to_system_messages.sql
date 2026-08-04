-- =============================================================================
-- Barter: attach tradeCompletionId to the complete_trade / file_trade_dispute
-- system messages (sync only: applied directly to Barter2 via Supabase MCP
-- in a planning chat; this file brings version control back in line with
-- what's already live)
--
-- Context: the dispute-filing UI needs to know, for any rendered 'system'
-- message, which trade_completions row it refers to -- to look up
-- completed_by/dispute_deadline/disputed_at and decide whether to show a
-- "Dispute this trade" action on that message bubble. Both the "Trade
-- marked complete..." message (complete_trade) and the "Trade completion
-- disputed..." message (file_trade_dispute) were inserted without that
-- link; this migration adds messages.data = {tradeCompletionId} to both via
-- create-or-replace, no schema change needed since messages.data already
-- exists as jsonb from the review-reminder/match notification work.
--
-- Confirmed live via pg_get_functiondef(complete_trade) and
-- pg_get_functiondef(file_trade_dispute) before writing this file;
-- reproduced verbatim below.
-- =============================================================================

create or replace function complete_trade(for_connection_id uuid, traded_item_ids uuid[])
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

  insert into messages (connection_id, sender_id, content, message_type, is_read, data)
    values (
      for_connection_id,
      the_caller_id,
      'Trade marked complete. ' || coalesce(the_other_username, 'The other participant') || ' has until ' ||
        to_char(the_dispute_deadline, 'FMMonth FMDD, YYYY') || ' to dispute.',
      'system',
      false,
      jsonb_build_object('tradeCompletionId', the_trade_completion_id)
    );

  perform notify_connections_item_unavailable(traded_item_ids, 'traded', for_connection_id);

  return jsonb_build_object(
    'tradeCompletionId', the_trade_completion_id,
    'disputeDeadline', the_dispute_deadline
  );
end;
$$;

create or replace function file_trade_dispute(p_trade_completion_id uuid, p_reason text default null)
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

  insert into messages (connection_id, sender_id, content, message_type, is_read, data)
    values (
      the_connection_id,
      the_caller_id,
      'Trade completion disputed. This will be reviewed by a moderator.',
      'system',
      false,
      jsonb_build_object('tradeCompletionId', p_trade_completion_id)
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
