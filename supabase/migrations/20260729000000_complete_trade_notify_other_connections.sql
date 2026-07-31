-- =============================================================================
-- Barter: complete_trade — notify other connections about a traded item
-- (draft, for review only, do not run yet)
--
-- Context: 20260728000000_complete_trade_rpc.sql explicitly deferred this —
-- see its "Deliberately NOT included here" note. complete_trade already
-- marks traded items status='traded'/is_active=false and messages the
-- direct trade partner; this migration adds the cross-connection half:
-- anyone else mid-conversation about one of the just-traded items should
-- find out it's gone, in the same connection where they were discussing it.
--
-- connections and connection_item_interests are both RLS-scoped to
-- participants only, so "find other connections referencing this item" has
-- to happen here, server-side, inside this already-SECURITY-DEFINER
-- function — a client-side query would just come back empty for anyone who
-- isn't a participant of those other connections.
--
-- Design, locked (see chat discussion):
--   - Only *other*, *active* connections are considered (ended connections
--     are skipped — nothing to notify anyone about there).
--   - Recipient is whichever of that other connection's two participants is
--     NOT the traded item's owner. The owner can't also be the recipient:
--     connections_unique_pair means the owner (one of this trade's two
--     participants) can appear in at most one other connection alongside
--     each third party, and that other connection is by definition not
--     for_connection_id, so exactly one of the two participants on the
--     other side is the owner and the other is the recipient.
--   - If multiple traded items land in the same other-connection (e.g. two
--     separate mutual-interest pairs with the same third person), that's
--     ONE bundled notification and ONE bundled system message, not one
--     per item.
--   - Notification type is 'item_unavailable', a shared type: data.reason
--     is 'traded' here; a future manual-cancel feature will reuse the same
--     type with data.reason = 'cancelled' rather than inventing a second
--     type for what's the same user-facing event ("this item you were
--     interested in is gone").
--   - The system message's sender_id is the item's owner, not the caller
--     completing the trade — the owner is a real participant of that other
--     connection (the caller may not be), matching the existing
--     messages.sender_id -> users FK.
-- =============================================================================

-- notifications.type's CHECK constraint (from the original 20250721220830
-- migration) doesn't know about 'item_unavailable' yet.
alter table notifications drop constraint notifications_type_check;

alter table notifications add constraint notifications_type_check
  check (type in ('match', 'message', 'trade_completed', 'review', 'system', 'item_unavailable'));

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
  the_other_conn record;
  the_owner_id uuid;
  the_recipient_id uuid;
  the_affected_item_ids uuid[];
  the_affected_item_titles text[];
  the_item_list_text text;
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

  -- Cross-connection fanout: anyone else mid-conversation about one of the
  -- just-traded items, in a connection other than this one.
  for the_other_conn in
    select c.id as connection_id, c.user_id_1, c.user_id_2
    from connections c
    where c.status = 'active'
      and c.id <> for_connection_id
      and exists (
        select 1 from connection_item_interests cii
        where cii.connection_id = c.id
          and (cii.item_id_1 = any(traded_item_ids) or cii.item_id_2 = any(traded_item_ids))
      )
  loop
    the_owner_id := case
      when the_other_conn.user_id_1 in (the_user_id_1, the_user_id_2) then the_other_conn.user_id_1
      else the_other_conn.user_id_2
    end;
    the_recipient_id := case
      when the_owner_id = the_other_conn.user_id_1 then the_other_conn.user_id_2
      else the_other_conn.user_id_1
    end;

    select array_agg(distinct traded_item_id)
      into the_affected_item_ids
      from unnest(traded_item_ids) as traded_item_id
      where exists (
        select 1 from connection_item_interests cii
        where cii.connection_id = the_other_conn.connection_id
          and (cii.item_id_1 = traded_item_id or cii.item_id_2 = traded_item_id)
      );

    select array_agg(title order by title)
      into the_affected_item_titles
      from items
      where id = any(the_affected_item_ids);

    the_item_list_text := array_to_string(the_affected_item_titles, ', ');

    insert into notifications (user_id, type, title, content, data)
      values (
        the_recipient_id,
        'item_unavailable',
        'Item No Longer Available',
        case when array_length(the_affected_item_titles, 1) > 1
          then the_item_list_text || ' were traded in another exchange and are no longer available.'
          else the_item_list_text || ' was traded in another exchange and is no longer available.'
        end,
        jsonb_build_object(
          'reason', 'traded',
          'connectionId', the_other_conn.connection_id,
          'itemIds', to_jsonb(the_affected_item_ids)
        )
      );

    insert into messages (connection_id, sender_id, content, message_type, is_read)
      values (
        the_other_conn.connection_id,
        the_owner_id,
        case when array_length(the_affected_item_titles, 1) > 1
          then the_item_list_text || ' were traded in another exchange and are no longer available.'
          else the_item_list_text || ' was traded in another exchange and is no longer available.'
        end,
        'system',
        false
      );
  end loop;

  return jsonb_build_object(
    'tradeCompletionId', the_trade_completion_id,
    'disputeDeadline', the_dispute_deadline
  );
end;
$$;

grant execute on function complete_trade(uuid, uuid[]) to authenticated;
revoke all on function complete_trade(uuid, uuid[]) from public;
revoke all on function complete_trade(uuid, uuid[]) from anon;
