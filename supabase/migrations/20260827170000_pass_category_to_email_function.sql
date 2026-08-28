-- Adds 'category' to the payload sent to send-notification-email, so it
-- can decide whether to attach a List-Unsubscribe header without
-- duplicating this type-to-category mapping in a second place. Only the
-- five toggleable categories get a category at all; every other
-- notification type gets null, which the Edge Function treats as "no
-- unsubscribe header", by design.

CREATE OR REPLACE FUNCTION public.trigger_send_notification_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_category text;
  v_prefs jsonb;
  v_email_enabled boolean;
BEGIN
  v_category := case NEW.type
    when 'match' then 'match'
    when 'like' then 'match'
    when 'message' then 'message'
    when 'product_update' then 'product_update'
    when 'review_reminder' then 'review_reminder'
    when 'onboarding_list_prompt' then 'onboarding'
    else null
  end;

  if v_category is not null then
    select notification_preferences into v_prefs from public.users where id = NEW.user_id;
    v_email_enabled := coalesce((v_prefs -> v_category ->> 'email')::boolean, true);
    if not v_email_enabled then
      return NEW;
    end if;
  end if;

  PERFORM net.http_post(
    url := 'https://flwaebciwfybvuaqtaqn.supabase.co/functions/v1/send-notification-email',
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'notifications',
      'record', to_jsonb(NEW),
      'old_record', null,
      'category', v_category
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsd2FlYmNpd2Z5YnZ1YXF0YXFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNzI4NjEsImV4cCI6MjA5OTk0ODg2MX0.Tn78M1-v6UJ9NvEhBLfMu8DRByWrDYX1-NIN5q6Mbiw',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsd2FlYmNpd2Z5YnZ1YXF0YXFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNzI4NjEsImV4cCI6MjA5OTk0ODg2MX0.Tn78M1-v6UJ9NvEhBLfMu8DRByWrDYX1-NIN5q6Mbiw'
    ),
    timeout_milliseconds := 10000
  );

  PERFORM pg_sleep(0.15);

  RETURN NEW;
END;
$function$;
