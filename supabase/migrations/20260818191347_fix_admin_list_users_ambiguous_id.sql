-- admin_list_users' RETURNS TABLE declares an output column named "id",
-- which shadows the bare "id" reference in the admin-check EXISTS clause
-- (plpgsql resolves it to the OUT parameter, not users.id), raising
-- "column reference id is ambiguous". Table-qualify the check.

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
