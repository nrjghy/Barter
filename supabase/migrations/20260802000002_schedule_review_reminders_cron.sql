-- =============================================================================
-- Barter: schedule send_review_reminders as a daily cron job
-- (sync only: this was applied directly to Barter2 via Supabase MCP in a
-- planning chat; this file brings version control back in line with what's
-- already live)
--
-- Runs daily at 03:00 UTC, off-peak for a Poland-based pilot. Confirmed
-- live via `SELECT * FROM cron.job WHERE jobname = 'send-review-reminders-daily'`
-- before writing this file; schedule/command match verbatim below.
-- =============================================================================

SELECT cron.schedule(
  'send-review-reminders-daily',
  '0 3 * * *',
  $$ SELECT public.send_review_reminders(); $$
);
