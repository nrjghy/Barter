CREATE FUNCTION public.create_group(p_name text, p_description text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  the_caller_id uuid := auth.uid();
  the_group_id uuid;
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  if p_name is null or trim(p_name) = '' then
    return jsonb_build_object('error', 'Group name is required');
  end if;

  insert into groups (name, description, creator_id)
    values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), the_caller_id)
    returning id into the_group_id;

  insert into group_memberships (group_id, user_id, role)
    values (the_group_id, the_caller_id, 'creator');

  return jsonb_build_object('success', true, 'groupId', the_group_id);
end;
$function$;

REVOKE ALL ON FUNCTION public.create_group(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_group(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_group(text, text) TO authenticated;

-- Accepts a username or email. Demo/system accounts, banned accounts,
-- and a genuine non-match all collapse to the same "No matching user
-- found" error -- none is distinguishable from outside, preserving the
-- same enumeration-prevention property the original username-only
-- design had.
CREATE FUNCTION public.invite_to_group(p_group_id uuid, p_identifier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  the_caller_id uuid := auth.uid();
  the_group_name text;
  the_caller_username text;
  the_target_id uuid;
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  if p_identifier is null or trim(p_identifier) = '' then
    return jsonb_build_object('error', 'Enter a username or email');
  end if;

  if not public.is_member_of_group(p_group_id) then
    return jsonb_build_object('error', 'You are not a member of this group');
  end if;

  select name into the_group_name from groups where id = p_group_id;
  if the_group_name is null then
    return jsonb_build_object('error', 'Group not found');
  end if;

  select u.id into the_target_id
  from users u
  join auth.users au on au.id = u.id
  where (u.username = trim(p_identifier) or lower(au.email) = lower(trim(p_identifier)))
    and not coalesce(u.is_demo, false)
    and not coalesce(u.is_system, false)
    and (au.banned_until is null or au.banned_until <= now());

  if the_target_id is null then
    return jsonb_build_object('error', 'No matching user found');
  end if;

  if the_target_id = the_caller_id then
    return jsonb_build_object('error', 'You cannot invite yourself');
  end if;

  if exists (select 1 from group_memberships where group_id = p_group_id and user_id = the_target_id) then
    return jsonb_build_object('error', 'This user is already a member of the group');
  end if;

  select coalesce(username, 'Someone') into the_caller_username from users where id = the_caller_id;

  insert into notifications (user_id, type, title, content, data)
    values (
      the_target_id,
      'group_invite',
      'Group invite',
      the_caller_username || ' invited you to join ''' || the_group_name || '''.',
      jsonb_build_object('groupId', p_group_id, 'invitedBy', the_caller_id, 'actionPath', '/groups/' || p_group_id, 'actionLabel', 'View invite')
    );

  return jsonb_build_object('success', true, 'groupId', p_group_id, 'invitedUserId', the_target_id);
end;
$function$;

REVOKE ALL ON FUNCTION public.invite_to_group(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invite_to_group(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.invite_to_group(uuid, text) TO authenticated;

CREATE FUNCTION public.transfer_group_ownership(p_group_id uuid, p_new_creator_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  the_caller_id uuid := auth.uid();
  the_caller_role text;
  the_target_id uuid;
  the_target_role text;
  the_group_name text;
  the_caller_username text;
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  select role into the_caller_role from group_memberships where group_id = p_group_id and user_id = the_caller_id;
  if the_caller_role is null then
    return jsonb_build_object('error', 'You are not a member of this group');
  end if;

  if the_caller_role <> 'creator' then
    return jsonb_build_object('error', 'Only the group creator can transfer ownership');
  end if;

  if p_new_creator_username is null or trim(p_new_creator_username) = '' then
    return jsonb_build_object('error', 'Username is required');
  end if;

  select id into the_target_id from users where username = trim(p_new_creator_username);
  if the_target_id is null then
    return jsonb_build_object('error', 'No user found with that exact username');
  end if;

  if the_target_id = the_caller_id then
    return jsonb_build_object('error', 'You are already the creator');
  end if;

  select role into the_target_role from group_memberships where group_id = p_group_id and user_id = the_target_id;
  if the_target_role is null then
    return jsonb_build_object('error', 'That user is not a member of this group');
  end if;

  update group_memberships set role = 'creator' where group_id = p_group_id and user_id = the_target_id;
  update group_memberships set role = 'member' where group_id = p_group_id and user_id = the_caller_id;
  update groups set creator_id = the_target_id, updated_at = now() where id = p_group_id;

  select name into the_group_name from groups where id = p_group_id;
  select coalesce(username, 'Someone') into the_caller_username from users where id = the_caller_id;

  insert into notifications (user_id, type, title, content, data)
    values (
      the_target_id,
      'group_ownership_transferred',
      'You''re now the group creator',
      the_caller_username || ' made you the creator of ''' || the_group_name || '''.',
      jsonb_build_object('groupId', p_group_id, 'transferredBy', the_caller_id, 'actionPath', '/groups/' || p_group_id, 'actionLabel', 'View group')
    );

  return jsonb_build_object('success', true, 'groupId', p_group_id, 'newCreatorId', the_target_id);
end;
$function$;

REVOKE ALL ON FUNCTION public.transfer_group_ownership(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_group_ownership(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.transfer_group_ownership(uuid, text) TO authenticated;

-- Creator is blocked from leaving directly, must transfer_group_ownership
-- first. Proactively scrubs the departing member's own items out of the
-- group and out of their own persisted browse_group_ids.
CREATE FUNCTION public.leave_group(p_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  the_caller_id uuid := auth.uid();
  the_caller_role text;
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  select role into the_caller_role from group_memberships where group_id = p_group_id and user_id = the_caller_id;
  if the_caller_role is null then
    return jsonb_build_object('error', 'You are not a member of this group');
  end if;

  if the_caller_role = 'creator' then
    return jsonb_build_object('error', 'Transfer ownership before leaving a group you created');
  end if;

  delete from group_memberships where group_id = p_group_id and user_id = the_caller_id;
  delete from item_groups where group_id = p_group_id
    and item_id in (select id from items where user_id = the_caller_id);

  update users set browse_group_ids = array_remove(browse_group_ids, p_group_id) where id = the_caller_id;

  return jsonb_build_object('success', true, 'groupId', p_group_id);
end;
$function$;

REVOKE ALL ON FUNCTION public.leave_group(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_group(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.leave_group(uuid) TO authenticated;

-- Creator-only, hard delete (cascades via ON DELETE CASCADE to
-- group_memberships and item_groups; underlying items are untouched).
-- Notifies every other member before the group disappears.
CREATE FUNCTION public.delete_group(p_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  the_caller_id uuid := auth.uid();
  the_caller_role text;
  the_group_name text;
  the_caller_username text;
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  select role into the_caller_role from group_memberships where group_id = p_group_id and user_id = the_caller_id;
  if the_caller_role is null then
    return jsonb_build_object('error', 'You are not a member of this group');
  end if;

  if the_caller_role <> 'creator' then
    return jsonb_build_object('error', 'Only the group creator can delete this group');
  end if;

  select name into the_group_name from groups where id = p_group_id;
  select coalesce(username, 'Someone') into the_caller_username from users where id = the_caller_id;

  insert into notifications (user_id, type, title, content, data)
  select
    gm.user_id,
    'group_deleted',
    'Group deleted',
    the_caller_username || ' deleted the group ''' || the_group_name || '''.',
    jsonb_build_object('groupName', the_group_name)
  from group_memberships gm
  where gm.group_id = p_group_id and gm.user_id <> the_caller_id;

  -- Cascades to group_memberships and item_groups (both ON DELETE CASCADE).
  delete from groups where id = p_group_id;

  return jsonb_build_object('success', true, 'groupName', the_group_name);
end;
$function$;

REVOKE ALL ON FUNCTION public.delete_group(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_group(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_group(uuid) TO authenticated;

-- Creator-only. Blocks self-removal (use transfer/delete instead).
-- Mirrors leave_group's cleanup: scrubs the removed member's own items
-- out of the group and out of their own browse_group_ids. Notifies the
-- removed member.
CREATE FUNCTION public.remove_group_member(p_group_id uuid, p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  the_caller_id uuid := auth.uid();
  the_caller_role text;
  the_target_role text;
  the_group_name text;
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  select role into the_caller_role from group_memberships where group_id = p_group_id and user_id = the_caller_id;
  if the_caller_role is null then
    return jsonb_build_object('error', 'You are not a member of this group');
  end if;

  if the_caller_role <> 'creator' then
    return jsonb_build_object('error', 'Only the group creator can remove members');
  end if;

  if p_member_id = the_caller_id then
    return jsonb_build_object('error', 'Use transfer ownership or delete the group instead of removing yourself');
  end if;

  select role into the_target_role from group_memberships where group_id = p_group_id and user_id = p_member_id;
  if the_target_role is null then
    return jsonb_build_object('error', 'That user is not a member of this group');
  end if;

  select name into the_group_name from groups where id = p_group_id;

  delete from group_memberships where group_id = p_group_id and user_id = p_member_id;
  delete from item_groups where group_id = p_group_id
    and item_id in (select id from items where user_id = p_member_id);
  update users set browse_group_ids = array_remove(browse_group_ids, p_group_id) where id = p_member_id;

  insert into notifications (user_id, type, title, content, data)
    values (
      p_member_id,
      'group_member_removed',
      'Removed from group',
      'You were removed from ''' || the_group_name || '''.',
      jsonb_build_object('groupName', the_group_name)
    );

  return jsonb_build_object('success', true, 'groupId', p_group_id, 'removedUserId', p_member_id);
end;
$function$;

REVOKE ALL ON FUNCTION public.remove_group_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_group_member(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.remove_group_member(uuid, uuid) TO authenticated;

-- Full-replace semantics, not incremental toggling -- always send the
-- complete desired set of group IDs. Validates the caller owns the item
-- and is a member of every group given.
CREATE FUNCTION public.set_item_groups(p_item_id uuid, p_group_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  the_caller_id uuid := auth.uid();
  the_owner_id uuid;
  the_invalid_count int;
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  select user_id into the_owner_id from items where id = p_item_id;
  if the_owner_id is null then
    return jsonb_build_object('error', 'Item not found');
  end if;

  if the_owner_id <> the_caller_id then
    return jsonb_build_object('error', 'You do not own this item');
  end if;

  if p_group_ids is not null and array_length(p_group_ids, 1) > 0 then
    select count(*) into the_invalid_count
      from unnest(p_group_ids) as gid
      where not exists (
        select 1 from group_memberships where group_id = gid and user_id = the_caller_id
      );
    if the_invalid_count > 0 then
      return jsonb_build_object('error', 'You can only share to groups you are a member of');
    end if;
  end if;

  delete from item_groups where item_id = p_item_id;

  if p_group_ids is not null and array_length(p_group_ids, 1) > 0 then
    insert into item_groups (item_id, group_id)
      select p_item_id, gid from unnest(p_group_ids) as gid;
  end if;

  return jsonb_build_object('success', true, 'itemId', p_item_id, 'groupCount', coalesce(array_length(p_group_ids, 1), 0));
end;
$function$;

REVOKE ALL ON FUNCTION public.set_item_groups(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_item_groups(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_item_groups(uuid, uuid[]) TO authenticated;

-- 'public' mode only touches browse_mode, leaving browse_group_ids
-- untouched -- switching to Public shouldn't wipe the remembered groups
-- selection. 'groups' mode filters to only currently-valid memberships.
CREATE FUNCTION public.update_browse_scope(p_mode text, p_group_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  the_caller_id uuid := auth.uid();
  the_valid_group_ids uuid[];
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  if p_mode not in ('public', 'groups') then
    return jsonb_build_object('error', 'Invalid mode');
  end if;

  if p_mode = 'public' then
    update users set browse_mode = 'public' where id = the_caller_id;
    return jsonb_build_object('success', true, 'mode', 'public');
  end if;

  select coalesce(array_agg(gid), '{}') into the_valid_group_ids
    from unnest(coalesce(p_group_ids, '{}'::uuid[])) as gid
    where exists (select 1 from group_memberships where group_id = gid and user_id = the_caller_id);

  update users set browse_mode = 'groups', browse_group_ids = the_valid_group_ids where id = the_caller_id;

  return jsonb_build_object('success', true, 'mode', 'groups', 'groupIds', to_jsonb(the_valid_group_ids));
end;
$function$;

REVOKE ALL ON FUNCTION public.update_browse_scope(text, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_browse_scope(text, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_browse_scope(text, uuid[]) TO authenticated;
