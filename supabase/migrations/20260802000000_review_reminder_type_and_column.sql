-- =============================================================================
-- Barter: review_reminder notification type + trade_completions tracking column
-- (sync only: this was applied directly to Barter2 via Supabase MCP in a
-- planning chat; this file brings version control back in line with what's
-- already live)
--
-- Context: PRD §4 wants a nudge to leave a review once a trade's dispute
-- window has closed, delivered as a notification like any other. That needs
-- a new notifications.type value ('review_reminder'), plus a way to know
-- which trade_completions have already had their reminder sent so the daily
-- job (send_review_reminders, next migration) doesn't re-notify every run.
--
-- Confirmed live via
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.notifications'::regclass AND contype = 'c';
-- and information_schema.columns for trade_completions before writing this
-- file; both match verbatim below.
-- =============================================================================

ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'match'::text,
    'message'::text,
    'trade_completed'::text,
    'review'::text,
    'system'::text,
    'item_unavailable'::text,
    'review_reminder'::text
  ]));

ALTER TABLE public.trade_completions ADD COLUMN review_reminder_sent_at timestamp with time zone;
