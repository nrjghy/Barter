-- =============================================================================
-- Barter: send_review_reminders function
-- (sync only: this was applied directly to Barter2 via Supabase MCP in a
-- planning chat; this file brings version control back in line with what's
-- already live)
--
-- Context: per PRD §4, the review reminder is a nudge, not a gate -- it
-- doesn't block anyone from reviewing early, it just prompts once the
-- dispute window has closed and nobody disputed. This function is meant to
-- run once a day via cron (next migration), not be called directly by
-- clients: for each trade_completions row whose dispute_deadline has
-- passed, wasn't disputed, and hasn't already had a reminder sent, it
-- notifies whichever of the two participants hasn't yet reviewed the other
-- (checked independently per side, since one participant reviewing doesn't
-- mean the other has), then stamps review_reminder_sent_at so later runs
-- don't re-notify the same trade.
--
-- Locked down the same way as create_notification_if_not_exists
-- (20260801000003): revoke EXECUTE from public/anon/authenticated, leaving
-- it callable only by its owner (postgres) and service_role -- i.e. only
-- from cron, never directly from a client.
--
-- Confirmed live via
--   SELECT pg_get_functiondef(oid) FROM pg_proc
--   WHERE proname = 'send_review_reminders';
-- before writing this file, reproduced verbatim below.
-- =============================================================================

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
$function$
;

REVOKE ALL ON FUNCTION public.send_review_reminders() FROM public;
REVOKE ALL ON FUNCTION public.send_review_reminders() FROM anon;
REVOKE ALL ON FUNCTION public.send_review_reminders() FROM authenticated;
