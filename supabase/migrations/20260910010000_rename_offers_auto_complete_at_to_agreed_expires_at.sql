-- Renames offers.auto_complete_at to agreed_expires_at, now that the
-- column no longer drives an auto-complete -- it drives an auto-
-- withdraw (see 20260910000000_agreed_offer_autowithdraw.sql). The old
-- name kept implying "trade happened" even after that migration flipped
-- the actual behavior; this rename brings the column name in line.
-- Already applied live on Barter2 (flwaebciwfybvuaqtaqn) and verified
-- working. Purely for version-control history -- not reapplied here.

alter table public.offers rename column auto_complete_at to agreed_expires_at;

-- accept_offer(): update to the renamed column and rename the returned
-- JSON key from autoCompleteAt to agreedExpiresAt.
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
  the_agreed_expires_at timestamptz;
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
  the_agreed_expires_at := now() + (the_expiry_days || ' days')::interval;

  update offers
    set status = 'agreed', agreed_at = now(), agreed_expires_at = the_agreed_expires_at
    where id = p_offer_id;

  select coalesce(username, 'The other participant') into the_caller_username from users where id = the_caller_id;

  insert into messages (connection_id, sender_id, content, message_type, is_read, data)
    values (
      the_connection_id, the_caller_id,
      the_caller_username || ' accepted the offer. If it is not confirmed by ' ||
        to_char(the_agreed_expires_at, 'FMMonth FMDD, YYYY') ||
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

  return jsonb_build_object('offerId', p_offer_id, 'agreedExpiresAt', the_agreed_expires_at);
end;
$function$;

-- process_agreed_offer_autowithdraw(): update to the renamed column.
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
      and o.agreed_expires_at > now()
      and o.agreed_expires_at <= now() + interval '1 day'
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
    where o.status = 'agreed' and o.agreed_expires_at <= now()
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
