-- =============================================================================
-- Barter: app_settings table
-- (sync only: this was applied directly to Barter2 in a planning chat and
-- verified there this session; this file brings version control back in
-- line with what's already live.)
--
-- Context: PRD §3 raises the daily like limit from the original 50 and
-- calls for it to be "implemented as a config value, not hardcoded, so it
-- can be tuned without a code change." This is that config store --
-- readable by any authenticated client (can_user_swipe, next migration,
-- reads it; swipeService.ts's checkSwipeLimit also reads it directly to
-- surface the current limit to the UI), writable only via service_role
-- or the dashboard. No client-side path to change a setting's value.
--
-- Confirmed live via information_schema.columns and pg_policy for
-- public.app_settings, and a direct select of its one seeded row, before
-- writing this file; reproduced verbatim below.
-- =============================================================================

CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read app settings" ON public.app_settings
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.app_settings (key, value) VALUES ('daily_like_limit', '300'::jsonb);
