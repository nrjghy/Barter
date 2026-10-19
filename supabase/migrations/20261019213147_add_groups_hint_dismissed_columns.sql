-- Groups onboarding hints (Groups page and Discover "My groups" filter).
-- These columns already existed on Barter-dev and are written by the frontend
-- (AuthContext.updateProfile), but were never defined in a migration and were
-- missing on Barter2. Same shape as the other *_hint_dismissed_at columns.
alter table public.users
  add column if not exists groups_hint_dismissed_at timestamptz,
  add column if not exists my_groups_filter_hint_dismissed_at timestamptz;
