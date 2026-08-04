-- =============================================================================
-- Barter: trade dispute schema (sync only: applied directly to Barter2 via
-- Supabase MCP in a planning chat; this file brings version control back in
-- line with what's already live)
--
-- Context: PRD §10 dispute flow needs file_trade_dispute (next migration) to
-- record why a trade completion was disputed, needs 'trade_dispute' as a
-- valid notifications.type so the disputed-against participant can be
-- notified, and needs an admin-readable path into trade_completions so the
-- Disputes tab in AdminDashboard can list them.
--
-- The original "Users can create trade completions" / "Users can update
-- their trade completions" policies (20260725000000_connection_model.sql)
-- let any connection participant freely insert/update trade_completions
-- rows client-side. That's no longer correct: all writes now go exclusively
-- through complete_trade and file_trade_dispute (both SECURITY DEFINER),
-- so the open policies are dropped here rather than left as unused but live
-- attack surface.
--
-- Confirmed live via information_schema.columns (trade_completions),
-- pg_get_constraintdef (notifications_type_check), and pg_policies
-- (trade_completions) before writing this file; reproduced verbatim below.
-- =============================================================================

ALTER TABLE public.trade_completions ADD COLUMN dispute_reason text;

DROP POLICY "Users can create trade completions" ON public.trade_completions;
DROP POLICY "Users can update their trade completions" ON public.trade_completions;

CREATE POLICY "Admins can view all trade completions" ON public.trade_completions
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'match'::text,
    'message'::text,
    'trade_completed'::text,
    'review'::text,
    'system'::text,
    'item_unavailable'::text,
    'review_reminder'::text,
    'issue_status'::text,
    'admin_daily_summary'::text,
    'trade_dispute'::text
  ]));
