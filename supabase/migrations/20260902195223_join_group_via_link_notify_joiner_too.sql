-- join_group_via_link only ever notified the invite link's creator ("New
-- member joined"). accept_group_invite (the invite-by-name/email path)
-- repurposes the invitee's own original invite notification into a read
-- "Group joined" confirmation left in their history; the link-based path
-- had no equivalent, since there's no prior notification to repurpose --
-- the joiner had nothing beyond an ephemeral toast. Found live during the
-- September 2, 2026 production smoke test (a real second account reported
-- "no notifications of any kind" after joining via a link). Fixed by
-- adding a second, pre-read "Group joined" notification insert for the
-- joiner, matching accept_group_invite's convention. Applied live via
-- Supabase MCP to both Barter2 and Barter-dev the same day; backfilled as
-- a migration file here to close the same repo-hygiene gap this comment
-- block is already flagging elsewhere in this session.

CREATE OR REPLACE FUNCTION public.join_group_via_link(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  the_caller_id uuid := auth.uid();
  the_link record;
  the_group_name text;
  the_caller_username text;
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  select id, group_id, expires_at, revoked_at, max_uses, use_count
    into the_link
    from group_invite_links
    where token = p_token
    for update;

  if the_link.id is null then
    return jsonb_build_object('error', 'Invite link not found');
  end if;

  if the_link.revoked_at is not null then
    return jsonb_build_object('error', 'This invite link has been revoked');
  end if;

  if the_link.expires_at <= now() then
    return jsonb_build_object('error', 'This invite link has expired');
  end if;

  if the_link.max_uses is not null and the_link.use_count >= the_link.max_uses then
    return jsonb_build_object('error', 'This invite link has reached its use limit');
  end if;

  select name into the_group_name from groups where id = the_link.group_id;
  if the_group_name is null then
    return jsonb_build_object('error', 'Group not found');
  end if;

  if exists (select 1 from group_memberships where group_id = the_link.group_id and user_id = the_caller_id) then
    return jsonb_build_object('success', true, 'groupId', the_link.group_id, 'alreadyMember', true);
  end if;

  insert into group_memberships (group_id, user_id, role)
    values (the_link.group_id, the_caller_id, 'member');

  update group_invite_links set use_count = use_count + 1 where id = the_link.id;

  select coalesce(username, 'Someone') into the_caller_username from users where id = the_caller_id;

  insert into notifications (user_id, type, title, content, data)
    values (
      (select created_by from group_invite_links where id = the_link.id),
      'group_joined_via_link',
      'New member joined',
      the_caller_username || ' joined ''' || the_group_name || ''' via your invite link.',
      jsonb_build_object('groupId', the_link.group_id, 'joinedBy', the_caller_id, 'actionPath', '/groups/' || the_link.group_id, 'actionLabel', 'View group')
    );

  insert into notifications (user_id, type, title, content, data, read_at)
    values (
      the_caller_id,
      'group_joined_via_link',
      'Group joined',
      'You joined ''' || the_group_name || '''.',
      jsonb_build_object('groupId', the_link.group_id, 'actionPath', '/groups/' || the_link.group_id, 'actionLabel', 'View group'),
      now()
    );

  return jsonb_build_object('success', true, 'groupId', the_link.group_id, 'alreadyMember', false);
end;
$function$;
