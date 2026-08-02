-- =============================================================================
-- Barter: issue_status notification type + notify_issue_status_change trigger
-- (sync only: this was applied directly to Barter2 in a planning chat and
-- verified there this session -- fires on a real status change, correctly
-- does not fire on an unrelated field update or a same-value re-set; this
-- file brings version control back in line with what's already live.)
--
-- Context: with no moderation UI yet, a status change made via the
-- Supabase dashboard is otherwise invisible to the reporter. This gives
-- them a notification (same notifications table/type pattern as
-- review_reminder) whenever their issue's status actually changes,
-- worded from the trigger's own IS DISTINCT FROM check so it can't fire
-- on a no-op update.
--
-- Locked down the same way as send_review_reminders and
-- create_notification_if_not_exists: revoke EXECUTE from
-- public/anon/authenticated, leaving it callable only as a trigger
-- (invoked by the table owner) or from service_role/postgres directly,
-- never as a standalone client RPC.
--
-- Confirmed live via pg_get_constraintdef (notifications_type_check),
-- pg_get_functiondef (notify_issue_status_change), and pg_get_triggerdef
-- (issue_status_change_notify) before writing this file; reproduced
-- verbatim below.
-- =============================================================================

ALTER TABLE public.notifications
  DROP CONSTRAINT notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['match'::text, 'message'::text, 'trade_completed'::text, 'review'::text, 'system'::text, 'item_unavailable'::text, 'review_reminder'::text, 'issue_status'::text]));

CREATE OR REPLACE FUNCTION public.notify_issue_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO notifications (user_id, type, title, content, data)
    VALUES (
      NEW.user_id,
      'issue_status',
      'Update on your report',
      'Your report "' || NEW.title || '" is now ' || replace(NEW.status, '_', ' ') || '.',
      jsonb_build_object('issue_id', NEW.id, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_issue_status_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_issue_status_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_issue_status_change() FROM authenticated;

CREATE TRIGGER issue_status_change_notify
AFTER UPDATE ON public.issues
FOR EACH ROW
EXECUTE FUNCTION public.notify_issue_status_change();
