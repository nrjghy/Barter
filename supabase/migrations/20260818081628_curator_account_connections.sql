-- Curator account support ("Barter Finds"): reposts external OLX/Facebook
-- listings under a dedicated user flagged is_curator. Deliberately NOT
-- is_system/is_demo -- get_items_browse excludes those owners, and curated
-- items must stay visible in Discover.
ALTER TABLE public.users ADD COLUMN is_curator boolean NOT NULL DEFAULT false;

-- Modeled directly on create_giveaway_connection (see live definition --
-- the 20260812140000_connection_creation_system_messages.sql migration file
-- is stale/drifted from it), but gates on the item owner's is_curator
-- instead of listing_type = 'giveaway', and doesn't restrict by listing
-- type -- a curator item can be either trade or giveaway. The automated
-- first message points the interested user at the original external
-- listing, since the curator account itself never replies.
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
  lister_is_curator boolean;
  lister_username text;
  interested_username text;
  sorted_user_id_1 uuid;
  sorted_user_id_2 uuid;
  the_connection_id uuid;
  is_new_connection boolean;
  already_registered boolean;
begin
  if auth.uid() is null or auth.uid() != interested_user_id then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  perform pg_advisory_xact_lock(hashtext(interested_user_id::text), hashtext(curator_item_id::text));

  select i.user_id, i.is_active, i.title, i.source_url, u.is_curator
  into lister_user_id, item_is_active, item_title, item_source_url, lister_is_curator
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

  select user_id_1, user_id_2 into sorted_user_id_1, sorted_user_id_2
  from sort_user_pair(interested_user_id, lister_user_id);

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

  -- Same dedup pattern as create_giveaway_connection: connection_item_interests'
  -- UNIQUE constraint doesn't dedupe a NULL item_id_1, so this existence check
  -- does the dedup work an ON CONFLICT clause can't here.
  select exists (
    select 1 from connection_item_interests
    where connection_id = the_connection_id
      and item_id_1 is null
      and item_id_2 = curator_item_id
  ) into already_registered;

  if not already_registered then
    insert into connection_item_interests (connection_id, item_id_1, item_id_2)
    values (the_connection_id, null, curator_item_id);
  end if;

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

  -- The curator account still gets the standard notification -- that's the
  -- operator's signal to go look at the chat, unchanged from the
  -- giveaway/match pattern. The pilot user's copy deliberately avoids "It's
  -- a Match!" / "connected" language implying a live back-and-forth, since
  -- the curator account never replies.
  if is_new_connection then
    insert into notifications (user_id, type, title, content, data)
    values
      (lister_user_id, 'match', 'Interest in a curated listing',
       interested_username || ' is interested in your ''' || item_title || '''! Check the chat.',
       jsonb_build_object('connectionId', the_connection_id)),
      (interested_user_id, 'match', 'You''re connected!',
       'You''re connected with ' || lister_username || ' about a curated listing.',
       jsonb_build_object('connectionId', the_connection_id));
  else
    insert into notifications (user_id, type, title, content, data)
    values
      (lister_user_id, 'match', 'More interest in your curated listings',
       interested_username || ' is also interested in your ''' || item_title || '''. Check your chat.',
       jsonb_build_object('connectionId', the_connection_id)),
      (interested_user_id, 'match', 'New item in your chat',
       'You expressed interest in ' || lister_username || '''s ''' || item_title || '''. Check your chat.',
       jsonb_build_object('connectionId', the_connection_id));
  end if;

  insert into messages (connection_id, sender_id, content, message_type, is_read, data)
  values (
    the_connection_id,
    lister_user_id,
    'Thanks for your interest! This item was spotted on OLX/Facebook and isn''t listed by a Barter user. ' ||
      'View and contact the original lister here: ' || coalesce(item_source_url, '') ||
      ' (login required). Questions? Reply here, the Barter team reads these messages.',
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

-- Adds a curator branch (gated on the item owner's is_curator, independent
-- of listing_type) alongside the existing is_system/giveaway branches, and
-- a matching curatorConnectionNeeded flag on every returned shape.
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

  select i.user_id, u.is_system, u.is_curator, i.listing_type
  into target_item_user_id, target_item_is_system, target_item_is_curator, target_item_listing_type
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

-- Server-side guard: a curated listing's exchange happens off-platform, so
-- offers can't be proposed on a connection where either participant is the
-- curator account. p_proposer_id/p_recipient_id are already the connection's
-- two participants (resolved by the create_offer/counter-offer callers), so
-- no extra join to connections is needed here.
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
      jsonb_build_object('connectionId', p_connection_id, 'offerId', the_offer_id)
    );

  return jsonb_build_object('offerId', the_offer_id, 'expiresAt', the_expires_at);
end;
$function$;

-- Same server-side guard for trade completion -- checked right after the
-- connection's two participants are resolved, before any item validation.
CREATE OR REPLACE FUNCTION public._complete_trade_core(p_connection_id uuid, p_completed_by uuid, p_traded_item_ids uuid[], p_auto_completed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  the_user_id_1 uuid;
  the_user_id_2 uuid;
  the_other_user_id uuid;
  the_other_username text;
  the_trade_completion_id uuid;
  the_dispute_deadline timestamptz;
  the_item_count int;
  the_valid_item_count int;
  the_covered_offer_id uuid;
begin
  select user_id_1, user_id_2 into the_user_id_1, the_user_id_2 from connections where id = p_connection_id;
  the_other_user_id := case when p_completed_by = the_user_id_1 then the_user_id_2 else the_user_id_1 end;

  if exists (
    select 1 from users where id in (the_user_id_1, the_user_id_2) and is_curator = true
  ) then
    return jsonb_build_object('error', 'Curated listings are external -- trades can''t be marked complete through Barter for this connection');
  end if;

  select count(*) into the_item_count from unnest(p_traded_item_ids);

  select count(*) into the_valid_item_count
    from items i
    where i.id = any(p_traded_item_ids)
      and i.user_id in (the_user_id_1, the_user_id_2)
      and i.status = 'active';

  if the_valid_item_count <> the_item_count then
    return jsonb_build_object(
      'error',
      'One or more selected items are invalid, not owned by a connection participant, or no longer active'
    );
  end if;

  insert into trade_completions (connection_id, completed_by, auto_completed)
    values (p_connection_id, p_completed_by, p_auto_completed)
    returning id, dispute_deadline into the_trade_completion_id, the_dispute_deadline;

  insert into trade_completion_items (trade_completion_id, item_id)
    select the_trade_completion_id, traded_item_id from unnest(p_traded_item_ids) as traded_item_id;

  update items
    set status = 'traded', is_active = false, updated_at = now()
    where id = any(p_traded_item_ids);

  -- If this completion covers every item from a currently-agreed offer on
  -- this connection, close that offer out too -- otherwise it would keep
  -- sitting in 'agreed' and the auto-complete cron would try to act on it
  -- again. Deliberately a superset check, not an exact-match check: Mark
  -- Trade Complete's item picker is pre-filled but editable (confirmed
  -- scope), so a manual completion may legitimately include more than
  -- what was originally agreed. An agreed offer whose items aren't fully
  -- covered here is left alone -- it's a separate, still-open agreement,
  -- not this one.
  select o.id into the_covered_offer_id
    from offers o
    where o.connection_id = p_connection_id
      and o.status = 'agreed'
      and not exists (
        select 1 from offer_items oi
        where oi.offer_id = o.id and not (oi.item_id = any(p_traded_item_ids))
      )
    limit 1;

  if the_covered_offer_id is not null then
    update offers set status = 'completed', trade_completion_id = the_trade_completion_id
      where id = the_covered_offer_id;
  end if;

  select username into the_other_username from users where id = the_other_user_id;

  insert into messages (connection_id, sender_id, content, message_type, is_read, data)
    values (
      p_connection_id,
      p_completed_by,
      case when p_auto_completed then
        'This trade auto-completed after the agreed window passed without either participant confirming or withdrawing. Either participant has until ' ||
          to_char(the_dispute_deadline, 'FMMonth FMDD, YYYY') || ' to dispute.'
      else
        'Trade marked complete. ' || coalesce(the_other_username, 'The other participant') || ' has until ' ||
          to_char(the_dispute_deadline, 'FMMonth FMDD, YYYY') || ' to dispute.'
      end,
      'system',
      false,
      jsonb_build_object('tradeCompletionId', the_trade_completion_id)
    );

  perform notify_connections_item_unavailable(p_traded_item_ids, 'traded', p_connection_id);

  return jsonb_build_object(
    'tradeCompletionId', the_trade_completion_id,
    'disputeDeadline', the_dispute_deadline
  );
end;
$function$;

-- Defensive filter -- unreachable in practice while the insert-time guards
-- above hold, but keeps this cron from ever emailing/notifying about a
-- trade_completions row on a curator connection.
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
          'reviewee_id', tc.user_id_2
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
          'reviewee_id', tc.user_id_1
        )
      );
    END IF;

    UPDATE trade_completions
    SET review_reminder_sent_at = now()
    WHERE id = tc.trade_completion_id;
  END LOOP;
END;
$function$;
