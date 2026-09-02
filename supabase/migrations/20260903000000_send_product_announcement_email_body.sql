-- notifications.content is what NotificationCenter.tsx renders in-app,
-- raw, with no truncation or line-clamp. send_product_announcement wrote
-- the same content into both the in-app notification and the (as of the
-- previous migration) rich, multi-paragraph broadcast email -- fine for
-- every prior single-sentence notification type, but for the Groups
-- launch broadcast it meant the full email essay would show as one
-- in-app notification card. Found live, September 2-3, 2026, before the
-- broadcast was sent.
--
-- Adds an optional fourth parameter, p_email_body. When supplied, it's
-- {username}-substituted per recipient and stored as
-- notification.data.emailBody, which send-notification-email now prefers
-- over content when rendering the email (see that function's ninth
-- revision comment). p_content stays short and keeps driving the in-app
-- panel. p_email_body defaults to null: a caller that only passes
-- p_content behaves exactly as before, one piece of content for both
-- surfaces -- fully backward compatible.

CREATE OR REPLACE FUNCTION public.send_product_announcement(p_title text, p_content text, p_data jsonb DEFAULT '{}'::jsonb, p_email_body text DEFAULT NULL)
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

  -- {username} in p_title, p_content, or p_email_body is replaced per-recipient
  -- with their own users.username. p_content is what the in-app notification
  -- panel shows (kept short); p_email_body, when supplied, is the long-form
  -- copy used only by the email template via data.emailBody, letting one
  -- broadcast have a short in-app line and a rich, multi-paragraph email at
  -- the same time.
  insert into notifications (user_id, type, title, content, data)
  select
    u.id,
    'product_update',
    replace(p_title, '{username}', u.username),
    replace(p_content, '{username}', u.username),
    case
      when p_email_body is not null
        then p_data || jsonb_build_object('emailBody', replace(p_email_body, '{username}', u.username))
      else p_data
    end
  from users u
  where not coalesce(u.is_system, false)
    and not coalesce(u.is_demo, false)
    and exists (select 1 from auth.users au where au.id = u.id);

  get diagnostics recipient_count = row_count;

  return jsonb_build_object('success', true, 'recipientCount', recipient_count);
end;
$function$;
