-- Listing translation: trigger that calls the translate-item Edge Function.
-- NOT in supabase/migrations on purpose: it embeds the project URL and anon key, which differ per
-- environment. Replace <PROJECT_REF> and <ANON_KEY> before running it in the SQL editor (never commit the real key).
-- Fires after a listing is inserted, or after its title or description is edited.
-- The Edge Function's own write only touches translation columns, so it does not re-fire this trigger.
-- net.http_post is asynchronous (pg_net): the listing save never waits for the translation.
-- Same pattern as trigger_send_notification_email: project URL and anon key written into the function body.

CREATE OR REPLACE FUNCTION public.trigger_translate_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.translated_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/translate-item',
    body := jsonb_build_object('item_id', NEW.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>'
    ),
    timeout_milliseconds := 10000
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS items_translate_after_write ON public.items;
CREATE TRIGGER items_translate_after_write
  AFTER INSERT OR UPDATE OF title, description ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.trigger_translate_item();
