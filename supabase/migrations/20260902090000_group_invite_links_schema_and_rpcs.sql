-- Groups: shareable invite links
-- Table + 5 RPCs for generating, previewing, joining via, listing and revoking
-- group invite links. Currently live on Barter-dev only (created directly via
-- Supabase MCP), no prior migration file existed for any of this.
-- Pulled directly from Barter-dev (nfcqsehbcrgzycpwyrax) on 2026-09-02.

create table if not exists public.group_invite_links (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  token text not null unique,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  max_uses integer,
  use_count integer not null default 0,
  revoked_at timestamptz
);

create index if not exists group_invite_links_group_id_idx on public.group_invite_links using btree (group_id);
create index if not exists group_invite_links_token_idx on public.group_invite_links using btree (token);

alter table public.group_invite_links enable row level security;
-- No RLS policies exist on this table on Barter-dev, confirmed by direct
-- query, not assumed. It is never queried directly through PostgREST: every
-- access path goes through the SECURITY DEFINER RPCs below, whose own
-- EXECUTE grants are the real access control. Carry that forward as-is
-- unless you actually want direct-table reads to work, in which case this
-- migration needs policies added, not just replicated silently.

-- create_group_invite_link: creator or moderator only. Enforces at most one
-- active link per group by revoking any other still-active link first.
create or replace function public.create_group_invite_link(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  the_caller_id uuid := auth.uid();
  the_caller_role text;
  the_token text;
  the_link_id uuid;
  the_expires_at timestamptz := now() + interval '7 days';
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  select role into the_caller_role from group_memberships where group_id = p_group_id and user_id = the_caller_id;
  if the_caller_role is null then
    return jsonb_build_object('error', 'You are not a member of this group');
  end if;

  if the_caller_role not in ('creator', 'moderator') then
    return jsonb_build_object('error', 'Only the group owner or a moderator can create an invite link');
  end if;

  update group_invite_links set revoked_at = now() where group_id = p_group_id and revoked_at is null;

  the_token := encode(extensions.gen_random_bytes(20), 'hex');

  insert into group_invite_links (group_id, token, created_by, expires_at)
    values (p_group_id, the_token, the_caller_id, the_expires_at)
    returning id into the_link_id;

  return jsonb_build_object('success', true, 'linkId', the_link_id, 'token', the_token, 'expiresAt', the_expires_at);
end;
$function$;

grant execute on function public.create_group_invite_link(uuid) to authenticated;

-- get_group_invite_preview: the public, unauthenticated preview (group name
-- and description only) shown before sign-in is required. Must stay callable
-- by anon, that grant is not a mistake.
create or replace function public.get_group_invite_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  the_link record;
  the_group_name text;
  the_group_description text;
begin
  select gil.id, gil.group_id, gil.expires_at, gil.revoked_at, gil.max_uses, gil.use_count
    into the_link
    from group_invite_links gil
    where gil.token = p_token;

  if the_link.id is null then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  if the_link.revoked_at is not null then
    return jsonb_build_object('valid', false, 'reason', 'revoked');
  end if;

  if the_link.expires_at <= now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;

  if the_link.max_uses is not null and the_link.use_count >= the_link.max_uses then
    return jsonb_build_object('valid', false, 'reason', 'max_uses_reached');
  end if;

  select name, description into the_group_name, the_group_description
    from groups where id = the_link.group_id;

  if the_group_name is null then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object('valid', true, 'groupId', the_link.group_id, 'groupName', the_group_name, 'groupDescription', the_group_description);
end;
$function$;

grant execute on function public.get_group_invite_preview(text) to anon, authenticated;

-- join_group_via_link: requires an authenticated caller (existing user or
-- someone who just signed up through the link's own detour). No-ops with
-- alreadyMember: true rather than erroring if they're already a member.
create or replace function public.join_group_via_link(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  return jsonb_build_object('success', true, 'groupId', the_link.group_id, 'alreadyMember', false);
end;
$function$;

grant execute on function public.join_group_via_link(text) to authenticated;

-- list_group_invite_links: creator or moderator only. Returns only
-- currently-active (not revoked, not expired) links, which in practice is
-- at most one, given the single-active-link enforcement above.
create or replace function public.list_group_invite_links(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  the_caller_id uuid := auth.uid();
  the_caller_role text;
  the_links jsonb;
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  select role into the_caller_role from group_memberships where group_id = p_group_id and user_id = the_caller_id;
  if the_caller_role not in ('creator', 'moderator') then
    return jsonb_build_object('error', 'Only the group owner or a moderator can view invite links');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'token', token, 'createdAt', created_at, 'expiresAt', expires_at,
      'maxUses', max_uses, 'useCount', use_count, 'revokedAt', revoked_at
    ) order by created_at desc), '[]'::jsonb)
    into the_links
    from group_invite_links
    where group_id = p_group_id
      and revoked_at is null
      and expires_at > now();

  return jsonb_build_object('success', true, 'links', the_links);
end;
$function$;

grant execute on function public.list_group_invite_links(uuid) to authenticated;

-- revoke_group_invite_link: creator or moderator only.
create or replace function public.revoke_group_invite_link(p_link_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  the_caller_id uuid := auth.uid();
  the_group_id uuid;
  the_caller_role text;
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  select group_id into the_group_id from group_invite_links where id = p_link_id;
  if the_group_id is null then
    return jsonb_build_object('error', 'Invite link not found');
  end if;

  select role into the_caller_role from group_memberships where group_id = the_group_id and user_id = the_caller_id;
  if the_caller_role not in ('creator', 'moderator') then
    return jsonb_build_object('error', 'Only the group owner or a moderator can revoke an invite link');
  end if;

  update group_invite_links set revoked_at = now() where id = p_link_id and revoked_at is null;

  return jsonb_build_object('success', true);
end;
$function$;

grant execute on function public.revoke_group_invite_link(uuid) to authenticated;
