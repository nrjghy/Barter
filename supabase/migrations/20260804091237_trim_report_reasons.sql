-- =============================================================================
-- Barter: trim reports_reason_check to PRD §6's list (sync only: applied
-- directly to Barter2 via Supabase MCP in a planning chat; this file brings
-- version control back in line with what's already live)
--
-- Context: reports_reason_check allowed two values -- copyright_violation,
-- safety_concern -- that aren't part of PRD §6's reason list and had no
-- existing reports using either. Narrowed to exactly the seven PRD §6
-- reasons rather than leaving unused values live in the schema.
--
-- Confirmed live via pg_get_constraintdef (reports_reason_check) and a
-- direct count of reports by reason before writing this file; the
-- constraint below reproduces the narrowed list verbatim.
-- =============================================================================

ALTER TABLE public.reports DROP CONSTRAINT reports_reason_check;

ALTER TABLE public.reports ADD CONSTRAINT reports_reason_check
  CHECK (reason = ANY (ARRAY[
    'inappropriate_content'::text,
    'misleading_description'::text,
    'prohibited_item'::text,
    'spam'::text,
    'fake_listing'::text,
    'offensive_language'::text,
    'other'::text
  ]));
