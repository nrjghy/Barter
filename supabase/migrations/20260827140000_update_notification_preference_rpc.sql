-- Lets a signed-in user toggle their own notification_preferences from
-- Settings, rather than a raw client-side table write. Validates category
-- and channel against the known set instead of accepting arbitrary keys.
-- Only 'email' exists as a channel today; the check is here so a bad
-- client value fails loudly rather than silently writing garbage into the
-- JSONB, and so adding SMS/WhatsApp later is just widening this list.

CREATE OR REPLACE FUNCTION public.update_notification_preference(p_category text, p_channel text, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  IF p_category NOT IN ('match', 'message', 'product_update', 'review_reminder', 'onboarding') THEN
    RETURN jsonb_build_object('error', 'Invalid category');
  END IF;

  IF p_channel != 'email' THEN
    RETURN jsonb_build_object('error', 'Invalid channel');
  END IF;

  UPDATE public.users
  SET notification_preferences = jsonb_set(
    coalesce(notification_preferences, '{}'::jsonb),
    ARRAY[p_category, p_channel],
    to_jsonb(p_enabled)
  )
  WHERE id = auth.uid()
  RETURNING notification_preferences INTO v_result;

  RETURN jsonb_build_object('success', true, 'notification_preferences', v_result);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_notification_preference(text, text, boolean) FROM PUBLIC, anon;
