-- Agreed trades used to auto-complete after N days of silence (assuming
-- the trade happened). Flipped to auto-withdraw instead (assuming it did
-- not happen) -- forcing someone to actively "withdraw" a trade that
-- quietly fell through felt like an accusation. Already applied live on
-- Barter2 (flwaebciwfybvuaqtaqn) and verified working; this migration
-- exists purely to get it into version control.
--
-- offers.auto_complete_at is deliberately NOT renamed at the DB level
-- here, pending a separate review of the frontend/backend churn that
-- would take.

-- app_settings key rename (value unchanged, still 7)
update public.app_settings
  set key = 'offer_agreed_expiry_days'
  where key = 'offer_auto_complete_days';

-- notifications.type check constraint: add offer_confirm_reminder.
-- offer_auto_completing_soon is kept for historical rows -- nothing
-- sends it anymore.
alter table public.notifications drop constraint notifications_type_check;

alter table public.notifications add constraint notifications_type_check
  check (type = ANY (ARRAY[
    'match'::text, 'message'::text, 'trade_completed'::text, 'review'::text,
    'system'::text, 'item_unavailable'::text, 'review_reminder'::text,
    'issue_status'::text, 'admin_daily_summary'::text, 'trade_dispute'::text,
    'listing_expiry_reminder'::text, 'pending_approval'::text, 'product_update'::text,
    'offer_received'::text, 'offer_agreed'::text, 'offer_countered'::text,
    'offer_withdrawn'::text, 'offer_expiring_soon'::text, 'offer_auto_completing_soon'::text,
    'offer_confirm_reminder'::text, 'offer_expired'::text, 'like'::text,
    'admin_item_edit'::text, 'onboarding_list_prompt'::text,
    'group_invite'::text, 'group_invite_accepted'::text, 'group_invite_declined'::text,
    'group_ownership_transferred'::text, 'group_deleted'::text, 'group_member_removed'::text,
    'group_joined_via_link'::text, 'group_moderator_assigned'::text, 'group_moderator_removed'::text,
    'admin_new_listing'::text, 'admin_new_signup'::text, 'admin_new_report'::text,
    'admin_new_issue'::text, 'admin_new_dispute'::text
  ]));

-- accept_offer(): system chat message now explains the actual consequence
-- of inaction (auto-withdrawal + items becoming available again), and
-- reads the expiry days from the renamed app_settings key.
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
  the_expiry_days int;
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

  select (value #>> '{}')::int into the_expiry_days from app_settings where key = 'offer_agreed_expiry_days';
  if the_expiry_days is null then
    the_expiry_days := 7;
  end if;
  the_auto_complete_at := now() + (the_expiry_days || ' days')::interval;

  update offers
    set status = 'agreed', agreed_at = now(), auto_complete_at = the_auto_complete_at
    where id = p_offer_id;

  select coalesce(username, 'The other participant') into the_caller_username from users where id = the_caller_id;

  insert into messages (connection_id, sender_id, content, message_type, is_read, data)
    values (
      the_connection_id, the_caller_id,
      the_caller_username || ' accepted the offer. If it is not confirmed by ' ||
        to_char(the_auto_complete_at, 'FMMonth FMDD, YYYY') ||
        ', it will be automatically withdrawn and the items will become available to others again.',
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

-- Replaces process_agreed_offer_autocomplete(): reminder + final action
-- now both describe autowithdraw, not autocomplete, and point out that
-- Mark Trade Complete still works afterward (it isn't gated on offer
-- status, only on the connection being active and the items still being
-- active).
drop function if exists public.process_agreed_offer_autocomplete();

CREATE OR REPLACE FUNCTION public.process_agreed_offer_autowithdraw()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  the_offer record;
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
      select uid, 'offer_confirm_reminder', 'Confirm your trade',
        'An agreed trade will be automatically withdrawn soon unless confirmed, and the items will become available to others again. Confirm it now if it happened.',
        jsonb_build_object('connectionId', the_offer.connection_id, 'offerId', the_offer.id, 'actionPath', '/chat/' || the_offer.connection_id, 'actionLabel', 'Open chat')
      from unnest(array[the_offer.user_id_1, the_offer.user_id_2]) as uid;

    update offers set reminder_sent_at = now() where id = the_offer.id;
  end loop;

  for the_offer in
    select o.id, o.connection_id, o.proposed_by, c.user_id_1, c.user_id_2
    from offers o join connections c on c.id = o.connection_id
    where o.status = 'agreed' and o.auto_complete_at <= now()
  loop
    update offers set status = 'withdrawn' where id = the_offer.id;

    insert into messages (connection_id, sender_id, content, message_type, is_read, data)
      values (
        the_offer.connection_id, the_offer.proposed_by,
        'This agreed trade was not confirmed within the window and has been automatically withdrawn. The items are available to others again. If the trade already happened, you can still mark it complete from here.',
        'system', false,
        jsonb_build_object('offerId', the_offer.id)
      );

    insert into notifications (user_id, type, title, content, data)
      select uid, 'offer_withdrawn', 'Trade agreement withdrawn',
        'Your agreed trade was not confirmed in time and was automatically withdrawn. The items are available to others again. If it already happened, you can still confirm it from the chat.',
        jsonb_build_object('connectionId', the_offer.connection_id, 'offerId', the_offer.id, 'actionPath', '/chat/' || the_offer.connection_id, 'actionLabel', 'Open chat')
      from unnest(array[the_offer.user_id_1, the_offer.user_id_2]) as uid;
  end loop;
end;
$function$;

-- Cron: replace autocomplete-agreed-offers-daily with autowithdraw-agreed-offers-daily
select cron.unschedule('autocomplete-agreed-offers-daily');
select cron.schedule('autowithdraw-agreed-offers-daily', '10 4 * * *', $$select public.process_agreed_offer_autowithdraw();$$);
