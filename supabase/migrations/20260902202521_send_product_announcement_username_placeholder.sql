-- send_product_announcement sent identical content to every recipient, no
-- per-recipient substitution at all. The Groups launch announcement email
-- needed a "Hi {username}," greeting, and users.username is the only
-- name-like field that exists (no separate display-name column). Adds
-- support for a literal "{username}" placeholder in either p_title or
-- p_content, replaced per-recipient with their own username at insert
-- time. Backward compatible: replace() is a no-op when the placeholder is
-- absent, and no prior real call ever used that literal string.

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
  select u.id, 'product_update', replace(p_title, '{username}', u.username), replace(p_content, '{username}', u.username), p_data
  from users u
  where not coalesce(u.is_system, false)
    and not coalesce(u.is_demo, false)
    and exists (select 1 from auth.users au where au.id = u.id);

  get diagnostics recipient_count = row_count;

  return jsonb_build_object('success', true, 'recipientCount', recipient_count);
end;
$function$;
