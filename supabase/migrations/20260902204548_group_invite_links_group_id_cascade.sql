-- delete_group deletes the groups row and relies on cascading deletes for
-- its children. group_memberships and item_groups both already had
-- ON DELETE CASCADE on group_id; group_invite_links did not, so any group
-- that ever had an invite link created (even a revoked or expired one --
-- revoking only sets revoked_at, it doesn't remove the row) could never be
-- deleted. The delete hit a foreign-key violation, PostgREST returned a
-- 409, and the frontend just showed a generic "Failed to delete group"
-- toast with no indication of the real cause.
--
-- Found live (September 2, 2026) while cleaning up a test group created to
-- verify the new PostHog Groups instrumentation -- that group had an
-- invite link created for the same verification pass, and its delete
-- failed the same way. Confirmed via the live constraint definitions on
-- Barter2 (group_invite_links_group_id_fkey had no ON DELETE CASCADE,
-- unlike its two sibling tables) before writing this fix.

alter table public.group_invite_links
  drop constraint group_invite_links_group_id_fkey;

alter table public.group_invite_links
  add constraint group_invite_links_group_id_fkey
  foreign key (group_id) references public.groups(id) on delete cascade;
