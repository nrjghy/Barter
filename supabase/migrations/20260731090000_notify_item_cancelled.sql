-- =============================================================================
-- Barter: notify connections when a listing is manually cancelled
--
-- Context: 20260731081358 (complete_trade_notify_other_connections) added
-- cross-connection notification when a trade completes. Per the Project
-- Plan, manual cancellation needs the same "this item is gone" fanout.
-- cancelItem (itemService.ts) stays a plain client-side update on items --
-- that part is untouched. This migration only adds the server-side
-- notification path, needed for the same reason complete_trade's fanout
-- is server-side: connections/connection_item_interests are RLS-scoped to
-- participants only, so finding "which connections reference this item"
-- can't be done from the client for connections the canceller isn't in.
--
-- Unlike a trade, a cancel isn't tied to any one connection -- there's no
-- "current connection" to exclude from the fanout. Every active connection
-- referencing the cancelled item gets notified.
--
-- Two parts:
-- 1. Extract complete_trade's inline cross-connection fanout loop into a
--    shared function, notify_connections_item_unavailable. Kept as a plain
--    (SECURITY INVOKER) function, not SECURITY DEFINER -- it only ever runs
--    inside a SECURITY DEFINER caller (complete_trade or the new
--    notify_item_cancelled below), so it inherits that caller's elevated
--    context without needing its own. Owner determination is done directly
--    off items.user_id per affected item, rather than off the calling
--    connection's two participant IDs like the original inline version --
--    equivalent for complete_trade (an item's owner is always one of that
--    connection's two participants) but also correct for the cancel case,
--    which has no "calling connection" to derive participants from.
-- 2. notify_item_cancelled(p_item_id, p_user_id): a small SECURITY DEFINER
--    RPC that re-validates the caller owns the item and that its status is
--    genuinely 'cancelled' (not trusted blindly from the client, same
--    pattern complete_trade uses), then calls the shared function with a
--    single-item array, reason = 'cancelled', no exclusion.
--
-- Execute grants: learned from complete_trade's original gap (fixed in
-- 20260730201108) -- Postgres grants EXECUTE to PUBLIC on new functions by
-- default. Both new functions here explicitly grant to authenticated only
-- and revoke from public/anon in this same migration, rather than
-- discovering the gap later. notify_item_cancelled also gets
-- `set search_path = public`, standard hardening for SECURITY DEFINER
-- functions.
-- =============================================================================

create or replace function notify_connections_item_unavailable(
  p_item_ids uuid[],
  p_reason text,
  p_excluding_connection_id uuid default null
)
returns void
language plpgsql
as $$
declare
  the_other_conn record;
  the_owner_id uuid;
  the_recipient_id uuid;
  the_affected_item_ids uuid[];
  the_affected_item_titles text[];
  the_item_list_text text;
  the_message_text text;
begin
  for the_other_conn in
    select c.id as connection_id, c.user_id_1, c.user_id_2
    from connections c
    where c.status = 'active'
      and (p_excluding_connection_id is null or c.id <> p_excluding_connection_id)
      and exists (
        select 1 from connection_item_interests cii
        where cii.connection_id = c.id
          and (cii.item_id_1 = any(p_item_ids) or cii.item_id_2 = any(p_item_ids))
      )
  loop
    select array_agg(distinct the_item_id)
      into the_affected_item_ids
      from unnest(p_item_ids) as the_item_id
      where exists (
        select 1 from connection_item_interests cii
        where cii.connection_id = the_other_conn.connection_id
          and (cii.item_id_1 = the_item_id or cii.item_id_2 = the_item_id)
      );

    select user_id into the_owner_id
      from items
      where id = any(the_affected_item_ids)
      limit 1;

    the_recipient_id := case
      when the_owner_id = the_other_conn.user_id_1 then the_other_conn.user_id_2
      else the_other_conn.user_id_1
    end;

    select array_agg(title order by title)
      into the_affected_item_titles
      from items
      where id = any(the_affected_item_ids);

    the_item_list_text := array_to_string(the_affected_item_titles, ', ');

    the_message_text := case
      when p_reason = 'cancelled' then
        case when array_length(the_affected_item_titles, 1) > 1
          then the_item_list_text || ' were cancelled by their owner and are no longer available.'
          else the_item_list_text || ' was cancelled by its owner and is no longer available.'
        end
      else
        case when array_length(the_affected_item_titles, 1) > 1
          then the_item_list_text || ' were traded in another exchange and are no longer available.'
          else the_item_list_text || ' was traded in another exchange and is no longer available.'
        end
    end;

    insert into notifications (user_id, type, title, content, data)
      values (
        the_recipient_id,
        'item_unavailable',
        'Item No Longer Available',
        the_message_text,
        jsonb_build_object(
          'reason', p_reason,
          'connectionId', the_other_conn.connection_id,
          'itemIds', to_jsonb(the_affected_item_ids)
        )
      );

    insert into messages (connection_id, sender_id, content, message_type, is_read)
      values (
        the_other_conn.connection_id,
        the_owner_id,
        the_message_text,
        'system',
        false
      );
  end loop;
end;
$$;

revoke all on function notify_connections_item_unavailable(uuid[], text, uuid) from public;
revoke all on function notify_connections_item_unavailable(uuid[], text, uuid) from anon;

-- complete_trade, refactored to call the shared function instead of its
-- former inline loop. Everything above this point in the function body is
-- unchanged from 20260731081358.
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

  insert into messages (connection_id, sender_id, content, message_type, is_read)
    values (
      for_connection_id,
      the_caller_id,
      'Trade marked complete. ' || coalesce(the_other_username, 'The other participant') || ' has until ' ||
        to_char(the_dispute_deadline, 'FMMonth FMDD, YYYY') || ' to dispute.',
      'system',
      false
    );

  perform notify_connections_item_unavailable(traded_item_ids, 'traded', for_connection_id);

  return jsonb_build_object(
    'tradeCompletionId', the_trade_completion_id,
    'disputeDeadline', the_dispute_deadline
  );
end;
$$;

grant execute on function complete_trade(uuid, uuid[]) to authenticated;
revoke all on function complete_trade(uuid, uuid[]) from public;
revoke all on function complete_trade(uuid, uuid[]) from anon;

-- New RPC: notify_connections_item_unavailable for a single manually-
-- cancelled item, re-validating ownership and status server-side.
create function notify_item_cancelled(p_item_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  the_caller_id uuid := auth.uid();
  the_owner_id uuid;
  the_status text;
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  if the_caller_id <> p_user_id then
    return jsonb_build_object('error', 'Not authorized');
  end if;

  select user_id, status into the_owner_id, the_status
    from items
    where id = p_item_id;

  if the_owner_id is null then
    return jsonb_build_object('error', 'Item not found');
  end if;

  if the_owner_id <> the_caller_id then
    return jsonb_build_object('error', 'You can only cancel notifications for your own listings');
  end if;

  if the_status <> 'cancelled' then
    return jsonb_build_object('error', 'Item is not cancelled');
  end if;

  perform notify_connections_item_unavailable(array[p_item_id], 'cancelled', null);

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function notify_item_cancelled(uuid, uuid) to authenticated;
revoke all on function notify_item_cancelled(uuid, uuid) from public;
revoke all on function notify_item_cancelled(uuid, uuid) from anon;
