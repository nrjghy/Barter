-- =============================================================================
-- Barter: add 'listing_unavailable' to reports_reason_check (sync only:
-- applied directly to Barter-dev and Barter2 via Supabase MCP; this file
-- brings version control back in line with what's already live)
--
-- Context: lets users report a curated (source_url-backed) listing as no
-- longer available. Mirrors the new REPORT_REASONS entry in
-- src/types/index.ts ("No Longer Available"), inserted after 'fake_listing'.
--
-- Confirmed live on both projects via pg_get_constraintdef
-- (reports_reason_check) before writing this file; the constraint below
-- reproduces the live list verbatim.
-- =============================================================================

ALTER TABLE public.reports DROP CONSTRAINT reports_reason_check;

ALTER TABLE public.reports ADD CONSTRAINT reports_reason_check
  CHECK (reason = ANY (ARRAY[
    'inappropriate_content'::text,
    'misleading_description'::text,
    'prohibited_item'::text,
    'spam'::text,
    'fake_listing'::text,
    'listing_unavailable'::text,
    'offensive_language'::text,
    'other'::text
  ]));
