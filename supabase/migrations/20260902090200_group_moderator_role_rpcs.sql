-- Groups: moderator role assignment.
-- set_group_moderator / remove_group_moderator, creator-only both ways.
-- This pair was NOT named in the Project Plan's list of missing migrations,
-- but a direct query of Barter-dev found neither has a migration file either.
-- Pulled directly from Barter-dev (nfcqsehbcrgzycpwyrax) on 2026-09-02.

create or replace function public.set_group_moderator(p_group_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  the_caller_id uuid := auth.uid();
  the_caller_role text;
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
    return jsonb_build_object('error', 'Only the group owner can assign moderators');
  end if;

  select role into the_target_role from group_memberships where group_id = p_group_id and user_id = p_user_id;
  if the_target_role is null then
    return jsonb_build_object('error', 'That user is not a member of this group');
  end if;

  if the_target_role = 'creator' then
    return jsonb_build_object('error', 'The owner cannot be made a moderator');
  end if;

  if the_target_role = 'moderator' then
    return jsonb_build_object('error', 'That user is already a moderator');
  end if;

  update group_memberships set role = 'moderator' where group_id = p_group_id and user_id = p_user_id;

  select name into the_group_name from groups where id = p_group_id;
  select coalesce(username, 'Someone') into the_caller_username from users where id = the_caller_id;

  insert into notifications (user_id, type, title, content, data)
    values (
      p_user_id,
      'group_moderator_assigned',
      'You''re now a moderator',
      the_caller_username || ' made you a moderator of ''' || the_group_name || '''.',
      jsonb_build_object('groupId', p_group_id, 'assignedBy', the_caller_id, 'actionPath', '/groups/' || p_group_id, 'actionLabel', 'View group')
    );

  return jsonb_build_object('success', true, 'groupId', p_group_id, 'userId', p_user_id);
end;
$function$;

grant execute on function public.set_group_moderator(uuid, uuid) to authenticated;

create or replace function public.remove_group_moderator(p_group_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  the_caller_id uuid := auth.uid();
  the_caller_role text;
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
    return jsonb_build_object('error', 'Only the group owner can remove moderators');
  end if;

  select role into the_target_role from group_memberships where group_id = p_group_id and user_id = p_user_id;
  if the_target_role is null then
    return jsonb_build_object('error', 'That user is not a member of this group');
  end if;

  if the_target_role <> 'moderator' then
    return jsonb_build_object('error', 'That user is not a moderator');
  end if;

  update group_memberships set role = 'member' where group_id = p_group_id and user_id = p_user_id;

  select name into the_group_name from groups where id = p_group_id;
  select coalesce(username, 'Someone') into the_caller_username from users where id = the_caller_id;

  insert into notifications (user_id, type, title, content, data)
    values (
      p_user_id,
      'group_moderator_removed',
      'Moderator status removed',
      the_caller_username || ' removed your moderator status in ''' || the_group_name || '''.',
      jsonb_build_object('groupId', p_group_id, 'removedBy', the_caller_id, 'actionPath', '/groups/' || p_group_id, 'actionLabel', 'View group')
    );

  return jsonb_build_object('success', true, 'groupId', p_group_id, 'userId', p_user_id);
end;
$function$;

grant execute on function public.remove_group_moderator(uuid, uuid) to authenticated;
