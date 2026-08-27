-- Found live: send_product_announcement's 23-row bulk insert hit the exact
-- same Resend 10 req/sec limit as an earlier onboarding-reminder incident,
-- 11 of 23 rate-limited (429). That earlier fix only throttled one caller's
-- own loop; this throttles the trigger itself, so every insert path
-- (single or bulk, present or future) is protected uniformly.
--
-- Also found: two orphaned "Deleted User" public.users rows (no matching
-- auth.users) were counted as recipients and correctly failed lookup --
-- excluded here so recipientCount reflects people who can actually
-- receive something.

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

  PERFORM pg_sleep(0.15);

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.send_product_announcement(p_title text, p_content text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  the_caller_id uuid := auth.uid();
  the_caller_role text;
  recipient_count integer;
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  select role into the_caller_role from users where id = the_caller_id;
  if the_caller_role is distinct from 'admin' then
    return jsonb_build_object('error', 'Only an admin can send a product announcement');
  end if;

  if p_title is null or trim(p_title) = '' then
    return jsonb_build_object('error', 'Title is required');
  end if;

  if p_content is null or trim(p_content) = '' then
    return jsonb_build_object('error', 'Content is required');
  end if;

  insert into notifications (user_id, type, title, content, data)
  select u.id, 'product_update', p_title, p_content, p_data
  from users u
  where not coalesce(u.is_system, false)
    and not coalesce(u.is_demo, false)
    and exists (select 1 from auth.users au where au.id = u.id);

  get diagnostics recipient_count = row_count;

  return jsonb_build_object('success', true, 'recipientCount', recipient_count);
end;
$function$;
