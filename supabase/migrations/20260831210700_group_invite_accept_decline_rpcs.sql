-- Invite consumption is tracked via the notification's own `type`
-- flipping to group_invite_accepted/group_invite_declined, not
-- read_at -- an earlier version used read_at and broke, since the
-- notification panel's own "mark all read on open" behavior silently
-- consumed it before a user could ever click Accept/Decline. type is
-- fully decoupled from that read-badge system.

CREATE FUNCTION public.accept_group_invite(p_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  the_caller_id uuid := auth.uid();
  the_invite_notification_id uuid;
  the_inviter_id uuid;
  the_group_name text;
  the_caller_username text;
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  if exists (select 1 from group_memberships where group_id = p_group_id and user_id = the_caller_id) then
    return jsonb_build_object('error', 'You are already a member of this group');
  end if;

  select id, (data->>'invitedBy')::uuid
    into the_invite_notification_id, the_inviter_id
    from notifications
    where user_id = the_caller_id
      and type = 'group_invite'
      and (data->>'groupId')::uuid = p_group_id
    order by created_at desc
    limit 1;

  if the_invite_notification_id is null then
    return jsonb_build_object('error', 'No invite found for this group');
  end if;

  select name into the_group_name from groups where id = p_group_id;
  if the_group_name is null then
    return jsonb_build_object('error', 'Group not found');
  end if;

  insert into group_memberships (group_id, user_id, role)
    values (p_group_id, the_caller_id, 'member');

  update notifications
    set read_at = now(),
        type = 'group_invite_accepted',
        title = 'Group joined',
        content = 'You joined ''' || the_group_name || '''.'
    where id = the_invite_notification_id;

  select coalesce(username, 'Someone') into the_caller_username from users where id = the_caller_id;

  insert into notifications (user_id, type, title, content, data)
    values (
      the_inviter_id,
      'group_invite_accepted',
      'Invite accepted',
      the_caller_username || ' accepted your invite to ''' || the_group_name || '''.',
      jsonb_build_object('groupId', p_group_id, 'acceptedBy', the_caller_id)
    );

  return jsonb_build_object('success', true, 'groupId', p_group_id);
end;
$function$;

REVOKE ALL ON FUNCTION public.accept_group_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_group_invite(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_group_invite(uuid) TO authenticated;

CREATE FUNCTION public.decline_group_invite(p_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  the_caller_id uuid := auth.uid();
  the_invite_notification_id uuid;
  the_inviter_id uuid;
  the_group_name text;
  the_caller_username text;
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  if exists (select 1 from group_memberships where group_id = p_group_id and user_id = the_caller_id) then
    return jsonb_build_object('error', 'You are already a member of this group');
  end if;

  select id, (data->>'invitedBy')::uuid
    into the_invite_notification_id, the_inviter_id
    from notifications
    where user_id = the_caller_id
      and type = 'group_invite'
      and (data->>'groupId')::uuid = p_group_id
    order by created_at desc
    limit 1;

  if the_invite_notification_id is null then
    return jsonb_build_object('error', 'No invite found for this group');
  end if;

  select name into the_group_name from groups where id = p_group_id;
  if the_group_name is null then
    return jsonb_build_object('error', 'Group not found');
  end if;

  update notifications
    set read_at = now(),
        type = 'group_invite_declined',
        title = 'Invite declined',
        content = 'You declined the invite to ''' || the_group_name || '''.'
    where id = the_invite_notification_id;

  select coalesce(username, 'Someone') into the_caller_username from users where id = the_caller_id;

  insert into notifications (user_id, type, title, content, data)
    values (
      the_inviter_id,
      'group_invite_declined',
      'Invite declined',
      the_caller_username || ' declined your invite to ''' || the_group_name || '''.',
      jsonb_build_object('groupId', p_group_id, 'declinedBy', the_caller_id)
    );

  return jsonb_build_object('success', true, 'groupId', p_group_id);
end;
$function$;

REVOKE ALL ON FUNCTION public.decline_group_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decline_group_invite(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.decline_group_invite(uuid) TO authenticated;
