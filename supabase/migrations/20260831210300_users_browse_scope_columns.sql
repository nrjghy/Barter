-- Groups feature: persist the user's last-used Discover browse scope
-- (Public vs My Groups + which specific groups), so it carries forward
-- as the default on their next session. Updates go through
-- update_browse_scope (see the RPCs migration below), not a raw
-- client UPDATE.

ALTER TABLE public.users
  ADD COLUMN browse_mode text NOT NULL DEFAULT 'public' CHECK (browse_mode IN ('public', 'groups')),
  ADD COLUMN browse_group_ids uuid[] NOT NULL DEFAULT '{}';
