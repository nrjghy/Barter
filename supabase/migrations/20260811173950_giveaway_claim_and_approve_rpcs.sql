ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['match'::text, 'message'::text, 'trade_completed'::text, 'review'::text, 'system'::text, 'item_unavailable'::text, 'review_reminder'::text, 'issue_status'::text, 'admin_daily_summary'::text, 'trade_dispute'::text, 'listing_expiry_reminder'::text, 'pending_approval'::text]));

DROP FUNCTION IF EXISTS public.notify_connections_item_unavailable(uuid[], text, uuid);

CREATE OR REPLACE FUNCTION public.notify_connections_item_unavailable(
  p_item_ids uuid[],
  p_reason text,
  p_excluding_connection_id uuid DEFAULT NULL::uuid,
  p_superseded_connection_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS void
LANGUAGE plpgsql
AS $function$
declare
  the_other_conn record;
  the_owner_id uuid;
  the_recipient_id uuid;
  the_affected_item_ids uuid[];
  the_affected_item_titles text[];
  the_item_list_text text;
  the_message_text text;
  the_effective_reason text;
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

    the_effective_reason := case
      when p_superseded_connection_ids is not null and the_other_conn.connection_id = any(p_superseded_connection_ids)
        then 'superseded'
      else p_reason
    end;

    the_message_text := case
      when the_effective_reason = 'cancelled' then
        case when array_length(the_affected_item_titles, 1) > 1
          then the_item_list_text || ' were cancelled by their owner and are no longer available.'
          else the_item_list_text || ' was cancelled by its owner and is no longer available.'
        end
      when the_effective_reason = 'superseded' then
        case when array_length(the_affected_item_titles, 1) > 1
          then the_item_list_text || ' were given to someone else and are no longer available.'
          else the_item_list_text || ' was given to someone else and is no longer available.'
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
          'reason', the_effective_reason,
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
$function$;

REVOKE EXECUTE ON FUNCTION public.notify_connections_item_unavailable(uuid[], text, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_connections_item_unavailable(uuid[], text, uuid, uuid[]) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.claim_giveaway_completion(recipient_user_id uuid, for_connection_id uuid, for_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  the_user_id_1 uuid;
  the_user_id_2 uuid;
  the_connection_status text;
  the_lister_id uuid;
  item_owner_id uuid;
  item_listing_type text;
  item_status text;
  the_trade_completion_id uuid;
begin
  if auth.uid() is null or auth.uid() != recipient_user_id then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  select user_id_1, user_id_2, status
    into the_user_id_1, the_user_id_2, the_connection_status
    from connections
    where id = for_connection_id;

  if the_user_id_1 is null then
    return jsonb_build_object('error', 'Connection not found');
  end if;

  if recipient_user_id not in (the_user_id_1, the_user_id_2) then
    return jsonb_build_object('error', 'Not a participant in this connection');
  end if;

  if the_connection_status <> 'active' then
    return jsonb_build_object('error', 'Connection is not active');
  end if;

  the_lister_id := case when recipient_user_id = the_user_id_1 then the_user_id_2 else the_user_id_1 end;

  select user_id, listing_type, status
    into item_owner_id, item_listing_type, item_status
    from items
    where id = for_item_id;

  if item_owner_id is null then
    return jsonb_build_object('error', 'Item not found');
  end if;

  if item_listing_type != 'giveaway' then
    return jsonb_build_object('error', 'Item is not a giveaway listing');
  end if;

  if item_owner_id != the_lister_id then
    return jsonb_build_object('error', 'This item does not belong to the other participant in this connection');
  end if;

  if item_status != 'active' then
    return jsonb_build_object('error', 'Item is no longer active');
  end if;

  if not exists (
    select 1 from connection_item_interests
    where connection_id = for_connection_id
      and item_id_1 is null
      and item_id_2 = for_item_id
  ) then
    return jsonb_build_object('error', 'No registered interest in this item for this connection');
  end if;

  if exists (
    select 1 from trade_completions tc
    join trade_completion_items tci on tci.trade_completion_id = tc.id
    where tc.connection_id = for_connection_id
      and tci.item_id = for_item_id
      and tc.status in ('pending_approval', 'approved')
  ) then
    return jsonb_build_object('error', 'A claim already exists for this item on this connection');
  end if;

  insert into trade_completions (connection_id, completed_by, status)
    values (for_connection_id, recipient_user_id, 'pending_approval')
    returning id into the_trade_completion_id;

  insert into trade_completion_items (trade_completion_id, item_id)
    values (the_trade_completion_id, for_item_id);

  insert into messages (connection_id, sender_id, content, message_type, is_read, data)
    values (
      for_connection_id,
      recipient_user_id,
      'Claimed the giveaway item. Waiting for the lister to approve.',
      'system',
      false,
      jsonb_build_object('tradeCompletionId', the_trade_completion_id, 'giveawayItemId', for_item_id)
    );

  insert into notifications (user_id, type, title, content, data)
    values (
      the_lister_id,
      'pending_approval',
      'Giveaway claim pending your approval',
      'Someone claimed your giveaway item. Review and approve in chat.',
      jsonb_build_object('tradeCompletionId', the_trade_completion_id, 'connectionId', for_connection_id)
    );

  return jsonb_build_object(
    'tradeCompletionId', the_trade_completion_id,
    'status', 'pending_approval'
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_giveaway_completion(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_giveaway_completion(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_giveaway_completion(lister_user_id uuid, for_trade_completion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  the_connection_id uuid;
  the_completed_by uuid;
  the_status text;
  the_user_id_1 uuid;
  the_user_id_2 uuid;
  the_connection_status text;
  the_item_id uuid;
  item_owner_id uuid;
  item_listing_type text;
  item_status text;
  the_new_dispute_deadline timestamptz;
  the_superseded_ids uuid[];
  the_superseded_connection_ids uuid[];
begin
  if auth.uid() is null or auth.uid() != lister_user_id then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  select connection_id, completed_by, status
    into the_connection_id, the_completed_by, the_status
    from trade_completions
    where id = for_trade_completion_id;

  if the_connection_id is null then
    return jsonb_build_object('error', 'Trade completion not found');
  end if;

  if the_status <> 'pending_approval' then
    return jsonb_build_object('error', 'This claim is not awaiting approval');
  end if;

  select user_id_1, user_id_2, status
    into the_user_id_1, the_user_id_2, the_connection_status
    from connections
    where id = the_connection_id;

  if lister_user_id not in (the_user_id_1, the_user_id_2) then
    return jsonb_build_object('error', 'Not a participant in this connection');
  end if;

  if lister_user_id = the_completed_by then
    return jsonb_build_object('error', 'The lister cannot approve their own claim');
  end if;

  if the_connection_status <> 'active' then
    return jsonb_build_object('error', 'Connection is not active');
  end if;

  select item_id into the_item_id
    from trade_completion_items
    where trade_completion_id = for_trade_completion_id
    limit 1;

  if the_item_id is null then
    return jsonb_build_object('error', 'No item found for this claim');
  end if;

  select user_id, listing_type, status
    into item_owner_id, item_listing_type, item_status
    from items
    where id = the_item_id;

  if item_owner_id != lister_user_id then
    return jsonb_build_object('error', 'This item does not belong to you');
  end if;

  if item_listing_type != 'giveaway' then
    return jsonb_build_object('error', 'Item is not a giveaway listing');
  end if;

  if item_status != 'active' then
    return jsonb_build_object('error', 'Item is no longer active');
  end if;

  the_new_dispute_deadline := now() + interval '7 days';

  update trade_completions
    set status = 'approved',
        approved_at = now(),
        approved_by = lister_user_id,
        dispute_deadline = the_new_dispute_deadline
    where id = for_trade_completion_id;

  update items
    set status = 'traded', is_active = false, updated_at = now()
    where id = the_item_id;

  select array_agg(tc.id), array_agg(tc.connection_id)
    into the_superseded_ids, the_superseded_connection_ids
    from trade_completions tc
    join trade_completion_items tci on tci.trade_completion_id = tc.id
    where tci.item_id = the_item_id
      and tc.id != for_trade_completion_id
      and tc.status = 'pending_approval';

  if the_superseded_ids is not null then
    update trade_completions
      set status = 'superseded'
      where id = any(the_superseded_ids);
  end if;

  insert into messages (connection_id, sender_id, content, message_type, is_read, data)
    values (
      the_connection_id,
      lister_user_id,
      'Giveaway claim approved. Trade complete!',
      'system',
      false,
      jsonb_build_object('tradeCompletionId', for_trade_completion_id)
    );

  insert into notifications (user_id, type, title, content, data)
    values (
      the_completed_by,
      'trade_completed',
      'Giveaway approved',
      'The lister approved your claim. Enjoy your item!',
      jsonb_build_object('tradeCompletionId', for_trade_completion_id, 'connectionId', the_connection_id)
    );

  perform notify_connections_item_unavailable(
    ARRAY[the_item_id],
    'traded',
    the_connection_id,
    the_superseded_connection_ids
  );

  return jsonb_build_object(
    'tradeCompletionId', for_trade_completion_id,
    'status', 'approved',
    'disputeDeadline', the_new_dispute_deadline,
    'supersededCount', coalesce(array_length(the_superseded_ids, 1), 0)
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.approve_giveaway_completion(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_giveaway_completion(uuid, uuid) TO authenticated;
