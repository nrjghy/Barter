-- =============================================================================
-- Barter: inactivity auto-archive functions + cron jobs (sync only: applied
-- directly to Barter2 via Supabase MCP in a planning chat; this file brings
-- version control back in line with what's already live)
--
-- confirm_listing_still_available: called directly by the client (owner
-- taps "still available?" on their own listing). Owner-only, active-status-
-- only, same jsonb-error-key / SECURITY DEFINER / set search_path
-- convention as complete_trade and file_trade_dispute. It doesn't clear
-- inactivity_reminder_sent_at -- it just touches updated_at, which is what
-- both cron jobs below actually key off (see send_inactivity_reminders'
-- `inactivity_reminder_sent_at is null or inactivity_reminder_sent_at <
-- updated_at`, and archive_inactive_listings' mirror-image check). Locked
-- down the same way as complete_trade: EXECUTE revoked from public/anon,
-- granted to authenticated only.
--
-- send_inactivity_reminders: for every active listing untouched for
-- inactivity_reminder_days (app_settings, previous migration; falls back
-- to 30), and not already reminded since its last update, notifies the
-- owner (type 'listing_expiry_reminder') and stamps
-- inactivity_reminder_sent_at. Meant to run once daily via cron, not be
-- called by clients -- but unlike send_review_reminders, its EXECUTE
-- grants were left at the SECURITY DEFINER default (public/anon/
-- authenticated all still hold it live) rather than revoked; reproduced
-- as-is, not "corrected" to match send_review_reminders' stricter pattern.
--
-- archive_inactive_listings: expires (status = 'expired', is_active =
-- false) any active listing whose reminder was sent, wasn't superseded by
-- a later update (i.e. wasn't resolved by the owner confirming or editing
-- the listing), and is now past inactivity_grace_days (app_settings;
-- falls back to 7) since that reminder. Same SECURITY DEFINER / daily-cron
-- intent as send_inactivity_reminders, same as-is (non-revoked) grants.
--
-- Cron jobs run daily at 03:30 and 03:45 UTC respectively -- off-peak for
-- a Poland-based pilot, and staggered 15 minutes apart so archival always
-- sees that day's reminder run rather than racing it.
--
-- Confirmed live via pg_get_functiondef for all three functions,
-- information_schema.role_routine_grants, and
-- `SELECT * FROM cron.job WHERE jobname IN (...)` before writing this
-- file; reproduced verbatim below.
-- =============================================================================

CREATE FUNCTION public.confirm_listing_still_available(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  the_caller_id uuid := auth.uid();
  the_owner_id uuid;
  the_status text;
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  select user_id, status into the_owner_id, the_status
    from items where id = p_item_id;

  if the_owner_id is null then
    return jsonb_build_object('error', 'Item not found');
  end if;

  if the_owner_id <> the_caller_id then
    return jsonb_build_object('error', 'Not the owner of this listing');
  end if;

  if the_status <> 'active' then
    return jsonb_build_object('error', 'Listing is not active');
  end if;

  update items set updated_at = now() where id = p_item_id;

  return jsonb_build_object('itemId', p_item_id, 'confirmedAt', now());
end;
$function$
;

REVOKE ALL ON FUNCTION public.confirm_listing_still_available(uuid) FROM public;
REVOKE ALL ON FUNCTION public.confirm_listing_still_available(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.confirm_listing_still_available(uuid) TO authenticated;

CREATE FUNCTION public.send_inactivity_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  the_reminder_days int;
  the_item record;
begin
  select (value #>> '{}')::int into the_reminder_days
    from app_settings where key = 'inactivity_reminder_days';

  if the_reminder_days is null then
    the_reminder_days := 30;
  end if;

  for the_item in
    select id, user_id, title
    from items
    where status = 'active'
      and is_active = true
      and updated_at < now() - (the_reminder_days || ' days')::interval
      and (inactivity_reminder_sent_at is null or inactivity_reminder_sent_at < updated_at)
  loop
    insert into notifications (user_id, type, title, content, data)
      values (
        the_item.user_id,
        'listing_expiry_reminder',
        'Still have this?',
        '"' || the_item.title || '" hasn''t been updated in a while. Let us know if it''s still available.',
        jsonb_build_object(
          'itemId', the_item.id,
          'actionPath', '/item/' || the_item.id,
          'actionLabel', 'View listing'
        )
      );

    update items set inactivity_reminder_sent_at = now() where id = the_item.id;
  end loop;
end;
$function$
;

CREATE FUNCTION public.archive_inactive_listings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  the_grace_days int;
begin
  select (value #>> '{}')::int into the_grace_days
    from app_settings where key = 'inactivity_grace_days';

  if the_grace_days is null then
    the_grace_days := 7;
  end if;

  update items
    set status = 'expired', is_active = false, updated_at = now()
    where status = 'active'
      and is_active = true
      and inactivity_reminder_sent_at is not null
      and inactivity_reminder_sent_at >= updated_at
      and inactivity_reminder_sent_at < now() - (the_grace_days || ' days')::interval;
end;
$function$
;

SELECT cron.schedule(
  'send-inactivity-reminders-daily',
  '30 3 * * *',
  $$ select public.send_inactivity_reminders(); $$
);

SELECT cron.schedule(
  'archive-inactive-listings-daily',
  '45 3 * * *',
  $$ select public.archive_inactive_listings(); $$
);
