-- Per-channel, per-category notification preferences, structured as
-- {"category": {"channel": bool}} so adding SMS/WhatsApp later (planned)
-- is a new key inside each category, not a schema migration. Defaults
-- everyone to email-on for every toggleable category, matching PRD §7's
-- existing "everything delivered" default -- this adds an escape hatch,
-- it doesn't change default behavior.
--
-- Only 5 of 22 notification types are toggleable: match (covers 'like'
-- too), message, product_update, review_reminder, and onboarding (new
-- below). Everything else is transactional/requires-action and always
-- sends regardless of this column -- muting those risks someone missing
-- something needing a response. Deliberate, acknowledged reopening of
-- PRD §7's "no per-type granularity for v1" decision.

ALTER TABLE public.users
ADD COLUMN notification_preferences jsonb NOT NULL DEFAULT '{"match": {"email": true}, "message": {"email": true}, "product_update": {"email": true}, "review_reminder": {"email": true}, "onboarding": {"email": true}}'::jsonb;

-- Onboarding "list your first item" nudge: three stages (72h, 7d, 14d
-- since signup) for real users with zero listings. One notification type
-- reused across all three stages, tracked via a stage counter + last-sent
-- timestamp, same shape as items.inactivity_reminder_sent_at elsewhere.

ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['match'::text, 'message'::text, 'trade_completed'::text, 'review'::text, 'system'::text, 'item_unavailable'::text, 'review_reminder'::text, 'issue_status'::text, 'admin_daily_summary'::text, 'trade_dispute'::text, 'listing_expiry_reminder'::text, 'pending_approval'::text, 'product_update'::text, 'offer_received'::text, 'offer_agreed'::text, 'offer_countered'::text, 'offer_withdrawn'::text, 'offer_expiring_soon'::text, 'offer_auto_completing_soon'::text, 'offer_expired'::text, 'like'::text, 'admin_item_edit'::text, 'onboarding_list_prompt'::text]));

ALTER TABLE public.users
  ADD COLUMN onboarding_list_reminders_sent integer NOT NULL DEFAULT 0,
  ADD COLUMN onboarding_list_last_reminder_at timestamptz;

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
$function$;

CREATE OR REPLACE FUNCTION public.send_onboarding_list_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_title text;
  v_content text;
BEGIN
  FOR r IN
    SELECT u.id as user_id, au.created_at as signed_up_at, u.onboarding_list_reminders_sent as stage
    FROM public.users u
    JOIN auth.users au ON au.id = u.id
    WHERE NOT coalesce(u.is_demo, false)
      AND NOT coalesce(u.is_system, false)
      AND u.onboarding_list_reminders_sent < 3
      AND NOT EXISTS (SELECT 1 FROM public.items i WHERE i.user_id = u.id)
      AND (
        (u.onboarding_list_reminders_sent = 0 AND now() - au.created_at >= interval '72 hours')
        OR (u.onboarding_list_reminders_sent = 1 AND now() - u.onboarding_list_last_reminder_at >= interval '7 days')
        OR (u.onboarding_list_reminders_sent = 2 AND now() - u.onboarding_list_last_reminder_at >= interval '14 days')
      )
  LOOP
    IF r.stage = 0 THEN
      v_title := 'Ready to list your first item?';
      v_content := 'You joined Barter a few days ago. Listing something you don''t need anymore is the first step to start trading, it only takes a minute.';
    ELSIF r.stage = 1 THEN
      v_title := 'Your first trade starts with one listing';
      v_content := 'It''s been a week since you joined Barter. Post something nearby neighbors might want, you could have a match by tomorrow.';
    ELSE
      v_title := 'One more nudge before we stop';
      v_content := 'It''s been two weeks since you signed up. If you''re ready to give Barter a try, listing your first item takes less than a minute.';
    END IF;

    INSERT INTO public.notifications (user_id, type, title, content, data)
    VALUES (r.user_id, 'onboarding_list_prompt', v_title, v_content,
      jsonb_build_object('actionPath', '/add', 'actionLabel', 'List an item'));

    UPDATE public.users
    SET onboarding_list_reminders_sent = r.stage + 1,
        onboarding_list_last_reminder_at = now()
    WHERE id = r.user_id;

    -- Resend's documented limit is 10 requests/second; every notification
    -- insert here fires an async pg_net call via the trigger, so without
    -- this delay a backlog above ~10 people hits 429s (found live: 7 of
    -- 17 concurrent sends failed this way before this fix).
    PERFORM pg_sleep(0.15);
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.send_onboarding_list_reminders() FROM PUBLIC, anon, authenticated;

-- Scheduled inactive; activated separately once real sends are approved.
SELECT cron.schedule('send-onboarding-list-reminders-daily', '20 3 * * *', $$select public.send_onboarding_list_reminders();$$);
SELECT cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname = 'send-onboarding-list-reminders-daily'), active := false);
