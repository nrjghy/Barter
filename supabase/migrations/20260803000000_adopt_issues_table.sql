-- =============================================================================
-- Barter: adopt the issues table
-- (sync only: this table already exists live on Barter2 with 5 real rows,
-- created directly rather than through a tracked migration; this file
-- brings version control back in line with what's already there. No
-- schema change, no data touched.)
--
-- Context: repurposing this pre-existing, previously-orphan table for
-- in-app issue reporting (bug/feature/general/other), per CLAUDE.md's
-- known-issues list. RLS is already scoped sensibly: a user can insert
-- and view only their own issues, and can only update their own while
-- status = 'open' -- once triage moves it out of 'open' the reporter can
-- no longer edit it. There's no client-side path to change status at all
-- (nobody's own-row UPDATE policy allows changing status, since the
-- USING clause requires status = 'open' but there's no WITH CHECK
-- permitting a different status value to be written); admin status
-- changes go through the Supabase dashboard directly for now. A proper
-- moderation UI is separate, already-tracked work.
--
-- Confirmed live via information_schema.columns, pg_constraint, and
-- pg_policy for public.issues before writing this file; reproduced
-- verbatim below.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  issue_type text NOT NULL CHECK (issue_type = ANY (ARRAY['bug'::text, 'feature_request'::text, 'general'::text, 'other'::text])),
  status text DEFAULT 'open'::text CHECK (status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text])),
  priority text DEFAULT 'medium'::text CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])),
  image_urls text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own issues" ON public.issues
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own issues" ON public.issues
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own open issues" ON public.issues
  FOR UPDATE USING (auth.uid() = user_id AND status = 'open'::text);
