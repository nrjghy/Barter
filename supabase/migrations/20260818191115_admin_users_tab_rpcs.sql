-- =============================================================================
-- Barter: Admin console "Users" tab RPCs
--
-- admin_list_users: paginated/searchable user listing joined against
-- auth.users for fields not exposed via PostgREST (email, last_sign_in_at,
-- banned_until, signup_provider). Uses count(*) over() so the client gets
-- pagination in the same round trip -- this is the reference pattern for
-- future paginated admin RPCs, no existing convention to match.
--
-- signup_provider reads raw_app_meta_data->>'provider', which records the
-- *original* signup method and never changes -- unlike the providers array,
-- which accumulates every identity later linked to the account and would
-- misrepresent an email signup that later linked Google.
--
-- admin_set_user_banned / admin_delete_user / admin_set_user_role all guard
-- against the caller targeting themselves. admin_delete_user additionally
-- refuses to act on another admin (must be demoted first via
-- admin_set_user_role) and otherwise mirrors delete_own_account's
-- anonymize-then-remove-credential body exactly, parameterized by
-- target_user_id.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  username text,
  email text,
  role text,
  rating numeric,
  total_ratings int,
  is_demo boolean,
  is_curator boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  banned_until timestamptz,
  signup_provider text,
  item_count bigint,
  connection_count bigint,
  full_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- table-qualified: this function's RETURNS TABLE declares an output
  -- column named "id", which would otherwise shadow the bare "id" below
  if not exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role = 'admin') then
    raise exception 'Only an admin can list users';
  end if;

  return query
  select
    u.id,
    u.username,
    au.email::text,
    u.role,
    u.rating,
    u.total_ratings,
    u.is_demo,
    u.is_curator,
    u.created_at,
    au.last_sign_in_at,
    au.banned_until,
    au.raw_app_meta_data->>'provider' as signup_provider,
    (select count(*) from public.items i where i.user_id = u.id) as item_count,
    (select count(*) from public.connections c where c.user_id_1 = u.id or c.user_id_2 = u.id) as connection_count,
    count(*) over() as full_count
  from public.users u
  join auth.users au on au.id = u.id
  where p_search is null
     or u.username ilike '%' || p_search || '%'
     or au.email ilike '%' || p_search || '%'
  order by u.created_at desc
  limit p_limit offset p_offset;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_list_users(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, int, int) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_set_user_banned(target_user_id uuid, p_banned boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.users where id = auth.uid() and role = 'admin') then
    return jsonb_build_object('error', 'Only an admin can suspend or unban a user');
  end if;

  if target_user_id = auth.uid() then
    return jsonb_build_object('error', 'You cannot suspend or unban your own account');
  end if;

  if not exists (select 1 from public.users where id = target_user_id) then
    return jsonb_build_object('error', 'Account not found');
  end if;

  update auth.users
    set banned_until = case when p_banned then 'infinity'::timestamptz else null end
    where id = target_user_id;

  return jsonb_build_object('success', true, 'userId', target_user_id, 'banned', p_banned);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_banned(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_banned(uuid, boolean) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  the_target_role text;
  the_active_item_ids uuid[];
begin
  if not exists (select 1 from public.users where id = auth.uid() and role = 'admin') then
    return jsonb_build_object('error', 'Only an admin can delete another user''s account');
  end if;

  if target_user_id = auth.uid() then
    return jsonb_build_object('error', 'Use delete_own_account to delete your own account');
  end if;

  select role into the_target_role from users where id = target_user_id;
  if the_target_role is null then
    return jsonb_build_object('error', 'Account not found');
  end if;

  if the_target_role = 'admin' then
    return jsonb_build_object('error', 'This user is an admin -- demote them via admin_set_user_role before deleting');
  end if;

  -- capture active items before deactivating, so we know what to notify about
  select array_agg(id) into the_active_item_ids
    from items
    where user_id = target_user_id and status = 'active';

  update items
    set status = 'cancelled', is_active = false, updated_at = now()
    where user_id = target_user_id and status = 'active';

  if the_active_item_ids is not null and array_length(the_active_item_ids, 1) > 0 then
    perform notify_connections_item_unavailable(the_active_item_ids, 'cancelled', null);
  end if;

  -- anonymize in place rather than deleting the row: connections, messages,
  -- trade_completions, reviews, and reports all keep resolving normally for
  -- the other participant, since nothing they reference disappears
  update users
    set username = 'Deleted User',
        bio = null,
        avatar_url = null,
        location = null,
        latitude = null,
        longitude = null,
        updated_at = now()
    where id = target_user_id;

  -- remove the actual credential so the person can no longer log back in
  delete from auth.users where id = target_user_id;

  return jsonb_build_object('success', true, 'deletedUserId', target_user_id);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_set_user_role(target_user_id uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.users where id = auth.uid() and role = 'admin') then
    return jsonb_build_object('error', 'Only an admin can change a user''s role');
  end if;

  if target_user_id = auth.uid() then
    return jsonb_build_object('error', 'You cannot change your own role');
  end if;

  if not exists (select 1 from public.users where id = target_user_id) then
    return jsonb_build_object('error', 'Account not found');
  end if;

  if p_role not in ('user', 'admin') then
    return jsonb_build_object('error', 'Not a valid role: ' || p_role);
  end if;

  update users set role = p_role, updated_at = now() where id = target_user_id;

  return jsonb_build_object('success', true, 'userId', target_user_id, 'role', p_role);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;
