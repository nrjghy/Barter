-- Widens group_memberships.role's CHECK constraint to allow 'moderator',
-- alongside the pre-existing 'creator'/'member'. This was applied live via
-- Supabase MCP during the September 1-2, 2026 Groups fast-follow work (the
-- moderator role itself, PRD §16) but never captured as a migration file --
-- found as a real gap during the Barter2 deploy's pre-deploy audit
-- (September 2, 2026), which compared Barter-dev's actual applied migration
-- history against the repo's local files rather than trusting the files.
-- Backfilled here now, after the fact, matching the exact live definition
-- (confirmed via pg_get_constraintdef on Barter2, both databases already
-- carry this constraint from the direct MCP change; this file exists for
-- repo parity, not to be reapplied blind).

alter table public.group_memberships
  drop constraint group_memberships_role_check;

alter table public.group_memberships
  add constraint group_memberships_role_check
  check (role = any (array['creator'::text, 'moderator'::text, 'member'::text]));
