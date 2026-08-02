-- =============================================================================
-- Barter: drop reviews.trade_experience
-- (sync only: this was applied directly to Barter2 via Supabase MCP in a
-- planning chat; this file brings version control back in line with what's
-- already live)
--
-- Context: this column had no PRD mention, no confirmed product purpose,
-- and was only ever displayed (never written) in Profile.tsx -- there was
-- no path in the codebase that could set it. Dropped rather than kept as
-- unused, since ReviewDialog.tsx (the one review-writing UI, itself
-- orphaned with zero consumers) never wrote it either.
-- =============================================================================

ALTER TABLE public.reviews DROP COLUMN trade_experience;
