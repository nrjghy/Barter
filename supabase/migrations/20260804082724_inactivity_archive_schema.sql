-- =============================================================================
-- Barter: inactivity auto-archive schema (sync only: applied directly to
-- Barter2 via Supabase MCP in a planning chat; this file brings version
-- control back in line with what's already live)
--
-- Context: PRD §2 -- a listing that's gone untouched for a while gets a
-- "still available?" nudge, then is auto-archived (status = 'expired') if
-- nobody responds within a grace period. Two tunable settings, following
-- the same app_settings pattern as daily_like_limit:
--   - inactivity_reminder_days: how long a listing can go without an
--     update before the reminder fires (send_inactivity_reminders, next
--     migration).
--   - inactivity_grace_days: how much longer after the reminder before
--     archive_inactive_listings (next migration) expires it.
-- items.inactivity_reminder_sent_at tracks when the reminder last fired
-- for a listing; both functions in the next migration key their
-- eligibility checks off it. 'listing_expiry_reminder' is the new
-- notifications.type the reminder is delivered as.
--
-- Confirmed live via a direct select of both app_settings rows,
-- information_schema.columns (items), and pg_get_constraintdef
-- (notifications_type_check) before writing this file; reproduced
-- verbatim below.
-- =============================================================================

INSERT INTO public.app_settings (key, value) VALUES
  ('inactivity_reminder_days', '30'::jsonb),
  ('inactivity_grace_days', '7'::jsonb);

ALTER TABLE public.items ADD COLUMN inactivity_reminder_sent_at timestamp with time zone;

ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'match'::text,
    'message'::text,
    'trade_completed'::text,
    'review'::text,
    'system'::text,
    'item_unavailable'::text,
    'review_reminder'::text,
    'issue_status'::text,
    'admin_daily_summary'::text,
    'trade_dispute'::text,
    'listing_expiry_reminder'::text
  ]));
