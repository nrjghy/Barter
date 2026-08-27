-- Bypasses Supabase's Database Webhooks feature, which is unusable on this
-- project (supabase_functions schema missing, confirmed via Dashboard error
-- 3F000). Uses pg_net directly instead, same underlying mechanism Database
-- Webhooks would have used, just implemented as our own tracked migration.

CREATE OR REPLACE FUNCTION public.trigger_send_notification_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://flwaebciwfybvuaqtaqn.supabase.co/functions/v1/send-notification-email',
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'notifications',
      'record', to_jsonb(NEW),
      'old_record', null
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsd2FlYmNpd2Z5YnZ1YXF0YXFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNzI4NjEsImV4cCI6MjA5OTk0ODg2MX0.Tn78M1-v6UJ9NvEhBLfMu8DRByWrDYX1-NIN5q6Mbiw',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsd2FlYmNpd2Z5YnZ1YXF0YXFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNzI4NjEsImV4cCI6MjA5OTk0ODg2MX0.Tn78M1-v6UJ9NvEhBLfMu8DRByWrDYX1-NIN5q6Mbiw'
    ),
    timeout_milliseconds := 10000
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_send_notification_email() FROM PUBLIC;

CREATE TRIGGER send_notification_email_on_insert
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.trigger_send_notification_email();
