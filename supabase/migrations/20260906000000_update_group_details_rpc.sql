-- Groups: update_group_details, creator-only edit of a group's name/description.
-- Pulled directly from Barter2 (live definition), matching exactly -- do not
-- regenerate from scratch if this ever needs revisiting.

CREATE OR REPLACE FUNCTION public.update_group_details(p_group_id uuid, p_name text, p_description text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  the_caller_id uuid := auth.uid();
  the_caller_role text;
  the_clean_name text := trim(p_name);
  the_clean_description text := nullif(trim(coalesce(p_description, '')), '');
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  select role into the_caller_role from group_memberships where group_id = p_group_id and user_id = the_caller_id;
  if the_caller_role is null then
    return jsonb_build_object('error', 'You are not a member of this group');
  end if;

  if the_caller_role <> 'creator' then
    return jsonb_build_object('error', 'Only the group owner can edit group details');
  end if;

  if the_clean_name = '' or the_clean_name is null then
    return jsonb_build_object('error', 'Group name cannot be empty');
  end if;

  if length(the_clean_name) > 100 then
    return jsonb_build_object('error', 'Group name must be 100 characters or fewer');
  end if;

  if the_clean_description is not null and length(the_clean_description) > 500 then
    return jsonb_build_object('error', 'Description must be 500 characters or fewer');
  end if;

  update groups
    set name = the_clean_name,
        description = the_clean_description,
        updated_at = now()
    where id = p_group_id;

  return jsonb_build_object('success', true, 'groupId', p_group_id, 'name', the_clean_name, 'description', the_clean_description);
end;
$function$;

REVOKE ALL ON FUNCTION public.update_group_details(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_group_details(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_group_details(uuid, text, text) TO authenticated, service_role;
