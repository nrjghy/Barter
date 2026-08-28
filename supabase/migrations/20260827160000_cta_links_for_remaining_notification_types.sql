-- Adds actionPath/actionLabel to every notification-creating function that
-- was missing it, found via a full audit: only 5 of 23 functions had a
-- working CTA link before this (the ones touched earlier). This covers
-- the other 14 live ones. Two genuinely dead-code helpers
-- (create_notification, create_notification_if_not_exists, zero call
-- sites found) are left untouched. notify_issue_status_change is also
-- left untouched deliberately -- no user-facing issue-detail screen
-- exists to link to. send_product_announcement already accepts caller-
-- supplied data per announcement, no fixed change needed. Purely
-- additive to each existing data jsonb, no other logic changes anywhere
-- in these 14 functions.

CREATE OR REPLACE FUNCTION public._offer_create_core(p_connection_id uuid, p_proposer_id uuid, p_recipient_id uuid, p_proposer_item_ids uuid[], p_recipient_item_ids uuid[], p_is_counter boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  the_expiry_days int;
  the_expires_at timestamptz;
  the_offer_id uuid;
  the_valid_proposer_count int;
  the_valid_recipient_count int;
  the_locked_count int;
  the_proposer_username text;
begin
  if exists (
    select 1 from users where id in (p_proposer_id, p_recipient_id) and is_curator = true
  ) then
    return jsonb_build_object('error', 'Curated listings are external -- trades can''t be proposed through Barter for this connection');
  end if;

  if p_proposer_item_ids is null or array_length(p_proposer_item_ids, 1) is null
     or p_recipient_item_ids is null or array_length(p_recipient_item_ids, 1) is null then
    return jsonb_build_object('error', 'Select at least one item on each side');
  end if;

  select count(*) into the_valid_proposer_count
    from items i where i.id = any(p_proposer_item_ids) and i.user_id = p_proposer_id and i.status = 'active';
  if the_valid_proposer_count <> array_length(p_proposer_item_ids, 1) then
    return jsonb_build_object('error', 'One or more of your selected items is invalid or no longer active');
  end if;

  select count(*) into the_valid_recipient_count
    from items i where i.id = any(p_recipient_item_ids) and i.user_id = p_recipient_id and i.status = 'active';
  if the_valid_recipient_count <> array_length(p_recipient_item_ids, 1) then
    return jsonb_build_object('error', 'One or more of their selected items is invalid or no longer active');
  end if;

  select count(*) into the_locked_count
    from offer_items oi
    join offers o on o.id = oi.offer_id
    where oi.item_id = any(p_proposer_item_ids || p_recipient_item_ids)
      and o.status = 'agreed';
  if the_locked_count > 0 then
    return jsonb_build_object('error', 'One or more selected items are already committed to another agreed offer');
  end if;

  select (value #>> '{}')::int into the_expiry_days from app_settings where key = 'offer_expiry_days';
  if the_expiry_days is null then
    the_expiry_days := 4;
  end if;
  the_expires_at := now() + (the_expiry_days || ' days')::interval;

  begin
    insert into offers (connection_id, proposed_by, expires_at)
      values (p_connection_id, p_proposer_id, the_expires_at)
      returning id into the_offer_id;
  exception when unique_violation then
    return jsonb_build_object('error', 'There is already a pending offer on this connection');
  end;

  insert into offer_items (offer_id, item_id, offered_by)
    select the_offer_id, item_id, p_proposer_id from unnest(p_proposer_item_ids) as item_id
    union all
    select the_offer_id, item_id, p_recipient_id from unnest(p_recipient_item_ids) as item_id;

  select coalesce(username, 'The other participant') into the_proposer_username from users where id = p_proposer_id;

  insert into messages (connection_id, sender_id, content, message_type, is_read, data)
    values (
      p_connection_id, p_proposer_id,
      case when p_is_counter then 'Sent a counter-offer.' else 'Sent a trade offer.' end,
      'system', false,
      jsonb_build_object('offerId', the_offer_id)
    );

  insert into notifications (user_id, type, title, content, data)
    values (
      p_recipient_id,
      case when p_is_counter then 'offer_countered' else 'offer_received' end,
      case when p_is_counter then 'Counter-offer received' else 'New trade offer' end,
      case when p_is_counter then the_proposer_username || ' countered with a new offer.'
           else 'You have a new trade offer to review.' end,
      jsonb_build_object('connectionId', p_connection_id, 'offerId', the_offer_id, 'actionPath', '/chat/' || p_connection_id, 'actionLabel', 'View offer')
    );

  return jsonb_build_object('offerId', the_offer_id, 'expiresAt', the_expires_at);
end;
$function$;

CREATE OR REPLACE FUNCTION public.accept_offer(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  the_caller_id uuid := auth.uid();
  the_connection_id uuid;
  the_proposed_by uuid;
  the_status text;
  the_user_id_1 uuid;
  the_user_id_2 uuid;
  the_autocomplete_days int;
  the_auto_complete_at timestamptz;
  the_caller_username text;
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  select o.connection_id, o.proposed_by, o.status, c.user_id_1, c.user_id_2
    into the_connection_id, the_proposed_by, the_status, the_user_id_1, the_user_id_2
    from offers o join connections c on c.id = o.connection_id
    where o.id = p_offer_id;

  if the_connection_id is null then
    return jsonb_build_object('error', 'Offer not found');
  end if;

  if the_caller_id not in (the_user_id_1, the_user_id_2) then
    return jsonb_build_object('error', 'Not a participant in this connection');
  end if;

  if the_caller_id = the_proposed_by then
    return jsonb_build_object('error', 'You cannot accept your own offer');
  end if;

  if the_status <> 'pending' then
    return jsonb_build_object('error', 'This offer is no longer pending');
  end if;

  select (value #>> '{}')::int into the_autocomplete_days from app_settings where key = 'offer_auto_complete_days';
  if the_autocomplete_days is null then
    the_autocomplete_days := 7;
  end if;
  the_auto_complete_at := now() + (the_autocomplete_days || ' days')::interval;

  update offers
    set status = 'agreed', agreed_at = now(), auto_complete_at = the_auto_complete_at
    where id = p_offer_id;

  select coalesce(username, 'The other participant') into the_caller_username from users where id = the_caller_id;

  insert into messages (connection_id, sender_id, content, message_type, is_read, data)
    values (
      the_connection_id, the_caller_id,
      the_caller_username || ' accepted the offer. It will auto-complete on ' ||
        to_char(the_auto_complete_at, 'FMMonth FMDD, YYYY') || ' unless confirmed or withdrawn sooner.',
      'system', false,
      jsonb_build_object('offerId', p_offer_id)
    );

  insert into notifications (user_id, type, title, content, data)
    values (
      the_proposed_by, 'offer_agreed', 'Offer accepted',
      the_caller_username || ' accepted your trade offer.',
      jsonb_build_object('connectionId', the_connection_id, 'offerId', p_offer_id, 'actionPath', '/chat/' || the_connection_id, 'actionLabel', 'Open chat')
    );

  return jsonb_build_object('offerId', p_offer_id, 'autoCompleteAt', the_auto_complete_at);
end;
$function$;

CREATE OR REPLACE FUNCTION public.withdraw_offer(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  the_caller_id uuid := auth.uid();
  the_connection_id uuid;
  the_proposed_by uuid;
  the_status text;
  the_user_id_1 uuid;
  the_user_id_2 uuid;
  the_caller_username text;
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  select o.connection_id, o.proposed_by, o.status, c.user_id_1, c.user_id_2
    into the_connection_id, the_proposed_by, the_status, the_user_id_1, the_user_id_2
    from offers o join connections c on c.id = o.connection_id
    where o.id = p_offer_id;

  if the_connection_id is null then
    return jsonb_build_object('error', 'Offer not found');
  end if;

  if the_caller_id not in (the_user_id_1, the_user_id_2) then
    return jsonb_build_object('error', 'Not a participant in this connection');
  end if;

  if the_status = 'pending' and the_caller_id <> the_proposed_by then
    return jsonb_build_object('error', 'Only the person who made this offer can withdraw it');
  end if;

  if the_status not in ('pending', 'agreed') then
    return jsonb_build_object('error', 'This offer can no longer be withdrawn');
  end if;

  update offers set status = 'withdrawn' where id = p_offer_id;

  select coalesce(username, 'A participant') into the_caller_username from users where id = the_caller_id;

  insert into messages (connection_id, sender_id, content, message_type, is_read, data)
    values (
      the_connection_id, the_caller_id,
      the_caller_username || ' withdrew the ' || (case when the_status = 'agreed' then 'agreed trade' else 'offer' end) || '.',
      'system', false,
      jsonb_build_object('offerId', p_offer_id)
    );

  insert into notifications (user_id, type, title, content, data)
    select uid, 'offer_withdrawn', 'Trade offer withdrawn', the_caller_username || ' withdrew the trade offer.',
      jsonb_build_object('connectionId', the_connection_id, 'offerId', p_offer_id, 'actionPath', '/chat/' || the_connection_id, 'actionLabel', 'Open chat')
    from unnest(array[the_user_id_1, the_user_id_2]) as uid
    where uid <> the_caller_id;

  return jsonb_build_object('offerId', p_offer_id, 'status', 'withdrawn');
end;
$function$;

CREATE OR REPLACE FUNCTION public.process_pending_offer_expiry()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  the_offer record;
  the_recipient_id uuid;
begin
  for the_offer in
    select o.id, o.connection_id, o.proposed_by, c.user_id_1, c.user_id_2
    from offers o join connections c on c.id = o.connection_id
    where o.status = 'pending'
      and o.expires_at > now()
      and o.expires_at <= now() + interval '1 day'
      and o.reminder_sent_at is null
  loop
    the_recipient_id := case when the_offer.proposed_by = the_offer.user_id_1 then the_offer.user_id_2 else the_offer.user_id_1 end;

    insert into notifications (user_id, type, title, content, data)
      values (
        the_recipient_id, 'offer_expiring_soon', 'Trade offer expiring soon',
        'A trade offer is expiring soon. Respond before it closes.',
        jsonb_build_object('connectionId', the_offer.connection_id, 'offerId', the_offer.id, 'actionPath', '/chat/' || the_offer.connection_id, 'actionLabel', 'Open chat')
      );

    update offers set reminder_sent_at = now() where id = the_offer.id;
  end loop;

  for the_offer in
    select o.id, o.connection_id, o.proposed_by
    from offers o
    where o.status = 'pending' and o.expires_at <= now()
  loop
    update offers set status = 'expired' where id = the_offer.id;

    insert into messages (connection_id, sender_id, content, message_type, is_read, data)
      values (
        the_offer.connection_id, the_offer.proposed_by,
        'This trade offer expired without a response.', 'system', false,
        jsonb_build_object('offerId', the_offer.id)
      );

    insert into notifications (user_id, type, title, content, data)
      values (
        the_offer.proposed_by, 'offer_expired', 'Trade offer expired',
        'Your trade offer expired without a response.',
        jsonb_build_object('connectionId', the_offer.connection_id, 'offerId', the_offer.id, 'actionPath', '/chat/' || the_offer.connection_id, 'actionLabel', 'Open chat')
      );
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.process_agreed_offer_autocomplete()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  the_offer record;
  the_item_ids uuid[];
  the_result jsonb;
begin
  for the_offer in
    select o.id, o.connection_id, c.user_id_1, c.user_id_2
    from offers o join connections c on c.id = o.connection_id
    where o.status = 'agreed'
      and o.auto_complete_at > now()
      and o.auto_complete_at <= now() + interval '1 day'
      and o.reminder_sent_at is null
  loop
    insert into notifications (user_id, type, title, content, data)
      select uid, 'offer_auto_completing_soon', 'Trade auto-completing soon',
        'An agreed trade will auto-complete soon. Confirm it now, or withdraw if it did not happen.',
        jsonb_build_object('connectionId', the_offer.connection_id, 'offerId', the_offer.id, 'actionPath', '/chat/' || the_offer.connection_id, 'actionLabel', 'Open chat')
      from unnest(array[the_offer.user_id_1, the_offer.user_id_2]) as uid;

    update offers set reminder_sent_at = now() where id = the_offer.id;
  end loop;

  for the_offer in
    select o.id, o.connection_id, o.proposed_by
    from offers o
    where o.status = 'agreed' and o.auto_complete_at <= now()
  loop
    select array_agg(item_id) into the_item_ids from offer_items where offer_id = the_offer.id;

    the_result := public._complete_trade_core(the_offer.connection_id, the_offer.proposed_by, the_item_ids, true);

    if the_result ? 'error' then
      update offers set status = 'withdrawn' where id = the_offer.id;

      insert into messages (connection_id, sender_id, content, message_type, is_read, data)
        values (
          the_offer.connection_id, the_offer.proposed_by,
          'This agreed trade could not auto-complete because one of the items is no longer available. The agreement has been withdrawn.',
          'system', false,
          jsonb_build_object('offerId', the_offer.id)
        );
    end if;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_item(target_item_id uuid, p_title text, p_description text, p_category text, p_category_suggestion text, p_condition text, p_estimated_value numeric, p_value_currency text, p_tags text[], p_image_urls text[], p_location text, p_latitude numeric, p_longitude numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  the_old_title text;
  the_old_description text;
  the_old_category text;
  the_old_condition text;
  the_old_estimated_value numeric;
  the_old_value_currency text;
  the_old_location text;
  the_old_tags text[];
  the_old_image_urls text[];
  the_owner_id uuid;
  the_diff text[] := '{}';
begin
  if not exists (select 1 from public.users where id = auth.uid() and role = 'admin') then
    return jsonb_build_object('error', 'Only an admin can edit another user''s listing');
  end if;

  select title, description, category, condition, estimated_value, value_currency, location, tags, image_urls, user_id
  into the_old_title, the_old_description, the_old_category, the_old_condition, the_old_estimated_value,
       the_old_value_currency, the_old_location, the_old_tags, the_old_image_urls, the_owner_id
  from items where id = target_item_id;

  if the_owner_id is null then
    return jsonb_build_object('error', 'Item not found');
  end if;

  update items set
    title = p_title,
    description = p_description,
    category = p_category,
    category_suggestion = p_category_suggestion,
    condition = p_condition,
    estimated_value = p_estimated_value,
    value_currency = p_value_currency,
    tags = p_tags,
    image_urls = p_image_urls,
    location = p_location,
    latitude = p_latitude,
    longitude = p_longitude,
    updated_at = now()
  where id = target_item_id;

  if the_old_title is distinct from p_title then
    the_diff := the_diff || ('Title: "' || coalesce(the_old_title, '') || '" → "' || coalesce(p_title, '') || '"');
  end if;
  if the_old_description is distinct from p_description then
    the_diff := the_diff || ('Description: "' || coalesce(the_old_description, '') || '" → "' || coalesce(p_description, '') || '"');
  end if;
  if the_old_category is distinct from p_category then
    the_diff := the_diff || ('Category: "' || coalesce(the_old_category, '') || '" → "' || coalesce(p_category, '') || '"');
  end if;
  if the_old_condition is distinct from p_condition then
    the_diff := the_diff || ('Condition: "' || coalesce(the_old_condition, '') || '" → "' || coalesce(p_condition, '') || '"');
  end if;
  if the_old_estimated_value is distinct from p_estimated_value then
    the_diff := the_diff || ('Estimated value: "' || coalesce(the_old_estimated_value::text, '') || '" → "' || coalesce(p_estimated_value::text, '') || '"');
  end if;
  if the_old_value_currency is distinct from p_value_currency then
    the_diff := the_diff || ('Currency: "' || coalesce(the_old_value_currency, '') || '" → "' || coalesce(p_value_currency, '') || '"');
  end if;
  if the_old_location is distinct from p_location then
    the_diff := the_diff || ('Location: "' || coalesce(the_old_location, '') || '" → "' || coalesce(p_location, '') || '"');
  end if;
  if the_old_tags is distinct from p_tags then
    the_diff := the_diff || 'Tags updated'::text;
  end if;
  if the_old_image_urls is distinct from p_image_urls then
    the_diff := the_diff || 'Photos updated'::text;
  end if;

  if array_length(the_diff, 1) > 0 and the_owner_id != auth.uid() then
    insert into notifications (user_id, type, title, content, data)
    values (
      the_owner_id,
      'admin_item_edit',
      'An admin updated your listing',
      array_to_string(the_diff, '; '),
      jsonb_build_object('itemId', target_item_id, 'actionPath', '/item/' || target_item_id, 'actionLabel', 'View listing')
    );
  end if;

  return jsonb_build_object('success', true, 'itemId', target_item_id);
end;
$function$;

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
      jsonb_build_object('tradeCompletionId', for_trade_completion_id, 'connectionId', the_connection_id, 'actionPath', '/chat/' || the_connection_id, 'actionLabel', 'Open chat')
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
      jsonb_build_object('tradeCompletionId', the_trade_completion_id, 'connectionId', for_connection_id, 'actionPath', '/chat/' || for_connection_id, 'actionLabel', 'Review claim')
    );

  return jsonb_build_object(
    'tradeCompletionId', the_trade_completion_id,
    'status', 'pending_approval'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_curator_connection(interested_user_id uuid, curator_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  lister_user_id uuid;
  item_is_active boolean;
  item_title text;
  item_source_url text;
  item_location text;
  lister_is_curator boolean;
  lister_username text;
  interested_username text;
  the_connection_id uuid;
  is_new_connection boolean;
  already_registered boolean;
  message_content text;
begin
  if auth.uid() is null or auth.uid() != interested_user_id then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  select i.user_id, i.is_active, i.title, i.source_url, i.location, u.is_curator
  into lister_user_id, item_is_active, item_title, item_source_url, item_location, lister_is_curator
  from items i
  join users u on u.id = i.user_id
  where i.id = curator_item_id;

  if lister_user_id is null or item_is_active is not true then
    return jsonb_build_object('error', 'Item not found or inactive');
  end if;

  if lister_is_curator is not true then
    return jsonb_build_object('error', 'Item is not a curated listing');
  end if;

  if lister_user_id = interested_user_id then
    return jsonb_build_object('error', 'Cannot express interest in your own item');
  end if;

  if exists (
    select 1 from user_blocks ub
    where (ub.blocker_id = interested_user_id and ub.blocked_id = lister_user_id)
       or (ub.blocker_id = lister_user_id and ub.blocked_id = interested_user_id)
  ) then
    return jsonb_build_object('connectionCreated', false, 'reason', 'blocked');
  end if;

  if not exists (
    select 1 from responses
    where user_id = interested_user_id
      and item_id = curator_item_id
      and direction = 'like'
  ) then
    return jsonb_build_object('error', 'You have not expressed interest in this item');
  end if;

  select *
  into the_connection_id, is_new_connection, already_registered
  from public._bootstrap_one_directional_connection(interested_user_id, lister_user_id, curator_item_id);

  if already_registered then
    return jsonb_build_object(
      'connectionCreated', true,
      'connectionId', the_connection_id,
      'isNewConnection', is_new_connection,
      'alreadyRegistered', true,
      'curatorItemId', curator_item_id
    );
  end if;

  select coalesce(username, 'Barter Finds') into lister_username from users where id = lister_user_id;
  select coalesce(username, 'Someone') into interested_username from users where id = interested_user_id;
  item_title := coalesce(item_title, 'an item');

  if is_new_connection then
    insert into notifications (user_id, type, title, content, data)
    values
      (lister_user_id, 'match', 'Interest in a curated listing',
       interested_username || ' is interested in your ''' || item_title || '''! Check the chat.',
       jsonb_build_object('connectionId', the_connection_id, 'actionPath', '/chat/' || the_connection_id, 'actionLabel', 'Open chat')),
      (interested_user_id, 'match', 'You''re connected!',
       'You''re connected with ' || lister_username || ' about a curated listing.',
       jsonb_build_object('connectionId', the_connection_id, 'actionPath', '/chat/' || the_connection_id, 'actionLabel', 'Open chat'));
  else
    insert into notifications (user_id, type, title, content, data)
    values
      (lister_user_id, 'match', 'More interest in your curated listings',
       interested_username || ' is also interested in your ''' || item_title || '''. Check your chat.',
       jsonb_build_object('connectionId', the_connection_id, 'actionPath', '/chat/' || the_connection_id, 'actionLabel', 'Open chat')),
      (interested_user_id, 'match', 'New item in your chat',
       'You expressed interest in ' || lister_username || '''s ''' || item_title || '''. Check your chat.',
       jsonb_build_object('connectionId', the_connection_id, 'actionPath', '/chat/' || the_connection_id, 'actionLabel', 'Open chat'));
  end if;

  message_content := 'Thanks for your interest!' ||
    case when item_location is not null then ' This listing was found in ' || item_location || '.' else '' end ||
    ' It isn''t listed by a Barter user, so contact the original lister directly here to arrange it: ' ||
    coalesce(item_source_url, '') || ' (login required). Questions? Reply here, the Barter team reads these messages.';

  insert into messages (connection_id, sender_id, content, message_type, is_read, data)
  values (
    the_connection_id,
    lister_user_id,
    message_content,
    'system',
    false,
    jsonb_build_object('itemId', curator_item_id, 'sourceUrl', item_source_url)
  );

  return jsonb_build_object(
    'connectionCreated', true,
    'connectionId', the_connection_id,
    'isNewConnection', is_new_connection,
    'alreadyRegistered', false,
    'curatorItemId', curator_item_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.file_trade_dispute(p_trade_completion_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  the_caller_id uuid := auth.uid();
  the_connection_id uuid;
  the_user_id_1 uuid;
  the_user_id_2 uuid;
  the_completed_by uuid;
  the_auto_completed boolean;
  the_disputed_at timestamptz;
  the_dispute_deadline timestamptz;
  the_other_participant uuid;
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  select tc.connection_id, tc.completed_by, tc.auto_completed, tc.disputed_at, tc.dispute_deadline
    into the_connection_id, the_completed_by, the_auto_completed, the_disputed_at, the_dispute_deadline
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

  if the_caller_id = the_completed_by and not the_auto_completed then
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

  the_other_participant := case when the_caller_id = the_user_id_1 then the_user_id_2 else the_user_id_1 end;

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
      the_other_participant,
      'trade_dispute',
      'Trade completion disputed',
      'The other participant disputed a trade you were involved in.',
      jsonb_build_object('tradeCompletionId', p_trade_completion_id, 'connectionId', the_connection_id, 'actionPath', '/chat/' || the_connection_id, 'actionLabel', 'Open chat')
    );

  return jsonb_build_object(
    'tradeCompletionId', p_trade_completion_id,
    'disputedAt', now()
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_connections_item_unavailable(p_item_ids uuid[], p_reason text, p_excluding_connection_id uuid DEFAULT NULL::uuid, p_superseded_connection_ids uuid[] DEFAULT NULL::uuid[])
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
  the_agreed_offer record;
  the_offer_item_titles text[];
  the_offer_item_list_text text;
  the_offer_owner_id uuid;
  the_offer_owner_ids uuid[];
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
          'itemIds', to_jsonb(the_affected_item_ids),
          'actionPath', '/chat/' || the_other_conn.connection_id,
          'actionLabel', 'Open chat'
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

  for the_agreed_offer in
    select distinct o.id as offer_id, o.connection_id, c.user_id_1, c.user_id_2
    from offers o
    join connections c on c.id = o.connection_id
    join offer_items oi on oi.offer_id = o.id
    where o.status = 'agreed'
      and oi.item_id = any(p_item_ids)
      and (p_excluding_connection_id is null or o.connection_id <> p_excluding_connection_id)
  loop
    update offers set status = 'withdrawn' where id = the_agreed_offer.offer_id;

    select array_agg(distinct i.title order by i.title), array_agg(distinct i.user_id)
      into the_offer_item_titles, the_offer_owner_ids
      from offer_items oi2
      join items i on i.id = oi2.item_id
      where oi2.offer_id = the_agreed_offer.offer_id
        and i.id = any(p_item_ids);

    the_offer_owner_id := the_offer_owner_ids[1];
    the_offer_item_list_text := array_to_string(the_offer_item_titles, ', ');

    insert into notifications (user_id, type, title, content, data)
      select uid, 'offer_withdrawn', 'Agreed trade no longer available',
        'This agreed trade included ' || the_offer_item_list_text ||
          ', which ' || (case when array_length(the_offer_item_titles, 1) > 1 then 'were' else 'was' end) ||
          ' cancelled by its owner. The agreement has been withdrawn.',
        jsonb_build_object('connectionId', the_agreed_offer.connection_id, 'offerId', the_agreed_offer.offer_id, 'actionPath', '/chat/' || the_agreed_offer.connection_id, 'actionLabel', 'Open chat')
      from unnest(array[the_agreed_offer.user_id_1, the_agreed_offer.user_id_2]) as uid;

    insert into messages (connection_id, sender_id, content, message_type, is_read, data)
      values (
        the_agreed_offer.connection_id,
        the_offer_owner_id,
        'The agreed trade was withdrawn because ' || the_offer_item_list_text || ' ' ||
          (case when array_length(the_offer_item_titles, 1) > 1 then 'were' else 'was' end) || ' cancelled.',
        'system',
        false,
        jsonb_build_object('offerId', the_agreed_offer.offer_id)
      );
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_response_optimized(user_uuid uuid, target_item_id uuid, response_direction text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_item_user_id uuid;
  target_item_is_system boolean := false;
  target_item_is_curator boolean := false;
  target_item_listing_type text;
  target_item_title text;
  inserted_id uuid;
begin
  if auth.uid() is null or auth.uid() != user_uuid then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  if response_direction not in ('pass', 'like') then
    return jsonb_build_object('error', 'Invalid response direction');
  end if;

  if not exists (select 1 from users where id = user_uuid) then
    return jsonb_build_object('error', 'User not found');
  end if;

  if response_direction = 'like' and not public.can_user_swipe(user_uuid) then
    return jsonb_build_object('error', 'Daily swipe limit reached');
  end if;

  select i.user_id, u.is_system, u.is_curator, i.listing_type, i.title
  into target_item_user_id, target_item_is_system, target_item_is_curator, target_item_listing_type, target_item_title
  from items i
  join users u on u.id = i.user_id
  where i.id = target_item_id and i.is_active = true;

  if response_direction = 'like' and target_item_user_id is not null and exists (
    select 1 from user_blocks ub
    where (ub.blocker_id = user_uuid and ub.blocked_id = target_item_user_id)
       or (ub.blocker_id = target_item_user_id and ub.blocked_id = user_uuid)
  ) then
    return jsonb_build_object('error', 'Cannot like an item from a blocked user');
  end if;

  insert into responses (user_id, item_id, direction)
  values (user_uuid, target_item_id, response_direction)
  on conflict (user_id, item_id) do nothing
  returning id into inserted_id;

  if response_direction = 'like' and inserted_id is not null then
    update users set daily_swipes = daily_swipes + 1 where id = user_uuid;
  end if;

  if response_direction = 'like'
     and inserted_id is not null
     and target_item_user_id is not null
     and target_item_user_id != user_uuid
     and not target_item_is_system
     and not target_item_is_curator
  then
    insert into notifications (user_id, type, title, content, data)
    values (
      target_item_user_id,
      'like',
      'Someone liked your item',
      'Someone liked ''' || coalesce(target_item_title, 'an item') || '''' ||
        ' — check out their listings; a match needs you both to like each other''s items.',
      jsonb_build_object('likerUserId', user_uuid, 'itemId', target_item_id, 'actionPath', '/item/' || target_item_id, 'actionLabel', 'View item')
    );
  end if;

  if response_direction = 'like' and target_item_user_id is not null and target_item_is_system then
    return jsonb_build_object(
      'success', true,
      'isSystemItem', true,
      'isGiveaway', false,
      'matchCheckNeeded', false,
      'giveawayConnectionNeeded', false,
      'curatorConnectionNeeded', false,
      'targetItemUserId', target_item_user_id
    );
  end if;

  if response_direction = 'like' and target_item_user_id is not null and target_item_is_curator then
    return jsonb_build_object(
      'success', true,
      'isGiveaway', false,
      'matchCheckNeeded', false,
      'giveawayConnectionNeeded', false,
      'curatorConnectionNeeded', true,
      'targetItemUserId', target_item_user_id
    );
  end if;

  if response_direction = 'like' and target_item_user_id is not null and target_item_listing_type = 'giveaway' then
    return jsonb_build_object(
      'success', true,
      'isGiveaway', true,
      'matchCheckNeeded', false,
      'giveawayConnectionNeeded', true,
      'curatorConnectionNeeded', false,
      'targetItemUserId', target_item_user_id
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'isGiveaway', false,
    'matchCheckNeeded', response_direction = 'like' and target_item_user_id is not null,
    'giveawayConnectionNeeded', false,
    'curatorConnectionNeeded', false,
    'targetItemUserId', target_item_user_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.send_admin_daily_summary()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin RECORD;
  v_reports_count integer;
  v_issues_count integer;
  v_category_suggestions_count integer;
  v_disputes_count integer;
  v_window_start timestamptz := now() - interval '24 hours';
  v_content text;
BEGIN
  SELECT count(*) INTO v_reports_count
  FROM reports
  WHERE created_at >= v_window_start;

  SELECT count(*) INTO v_issues_count
  FROM issues
  WHERE created_at >= v_window_start;

  SELECT count(*) INTO v_category_suggestions_count
  FROM items
  WHERE category = 'Other'
    AND category_suggestion IS NOT NULL
    AND created_at >= v_window_start;

  SELECT count(*) INTO v_disputes_count
  FROM trade_completions
  WHERE disputed_at >= v_window_start;

  v_content := format(
    '%s new report%s, %s new issue%s, %s new category suggestion%s, %s new dispute%s in the last 24 hours.',
    v_reports_count, CASE WHEN v_reports_count = 1 THEN '' ELSE 's' END,
    v_issues_count, CASE WHEN v_issues_count = 1 THEN '' ELSE 's' END,
    v_category_suggestions_count, CASE WHEN v_category_suggestions_count = 1 THEN '' ELSE 's' END,
    v_disputes_count, CASE WHEN v_disputes_count = 1 THEN '' ELSE 's' END
  );

  FOR v_admin IN SELECT id FROM users WHERE role = 'admin' LOOP
    INSERT INTO notifications (user_id, type, title, content, data)
    VALUES (
      v_admin.id,
      'admin_daily_summary',
      'Daily admin summary',
      v_content,
      jsonb_build_object(
        'reports_count', v_reports_count,
        'issues_count', v_issues_count,
        'category_suggestions_count', v_category_suggestions_count,
        'disputes_count', v_disputes_count,
        'window_start', v_window_start,
        'window_end', now(),
        'actionPath', '/admin',
        'actionLabel', 'Open admin console'
      )
    );
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.send_review_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tc RECORD;
BEGIN
  FOR tc IN
    SELECT t.id AS trade_completion_id, c.id AS connection_id, c.user_id_1, c.user_id_2
    FROM trade_completions t
    JOIN connections c ON c.id = t.connection_id
    WHERE t.dispute_deadline < now()
      AND t.disputed_at IS NULL
      AND t.review_reminder_sent_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id IN (c.user_id_1, c.user_id_2) AND u.is_curator = true
      )
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM reviews r
      WHERE r.trade_completion_id = tc.trade_completion_id
        AND r.reviewer_id = tc.user_id_1
    ) THEN
      INSERT INTO notifications (user_id, type, title, content, data)
      VALUES (
        tc.user_id_1,
        'review_reminder',
        'Leave a review',
        'How did your trade go? Share a quick review.',
        jsonb_build_object(
          'trade_completion_id', tc.trade_completion_id,
          'connection_id', tc.connection_id,
          'reviewee_id', tc.user_id_2,
          'actionPath', '/trade-completion/' || tc.trade_completion_id || '/review',
          'actionLabel', 'Leave a review'
        )
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM reviews r
      WHERE r.trade_completion_id = tc.trade_completion_id
        AND r.reviewer_id = tc.user_id_2
    ) THEN
      INSERT INTO notifications (user_id, type, title, content, data)
      VALUES (
        tc.user_id_2,
        'review_reminder',
        'Leave a review',
        'How did your trade go? Share a quick review.',
        jsonb_build_object(
          'trade_completion_id', tc.trade_completion_id,
          'connection_id', tc.connection_id,
          'reviewee_id', tc.user_id_1,
          'actionPath', '/trade-completion/' || tc.trade_completion_id || '/review',
          'actionLabel', 'Leave a review'
        )
      );
    END IF;

    UPDATE trade_completions
    SET review_reminder_sent_at = now()
    WHERE id = tc.trade_completion_id;
  END LOOP;
END;
$function$;
