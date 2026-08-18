-- claim_giveaway_completion inserts into trade_completions directly,
-- bypassing _complete_trade_core entirely -- and curator items can be
-- listing_type = 'giveaway' (create_curator_connection doesn't restrict by
-- listing type), so the _complete_trade_core guard alone doesn't close this
-- path. approve_giveaway_completion only ever updates an existing
-- trade_completions row, so blocking the claim insert here is sufficient to
-- make it unreachable too.
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

  if exists (
    select 1 from users where id in (the_user_id_1, the_user_id_2) and is_curator = true
  ) then
    return jsonb_build_object('error', 'Curated listings are external -- trades can''t be marked complete through Barter for this connection');
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
