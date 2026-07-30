-- =============================================================================
-- Barter: tighten complete_trade's execute grant (draft, for review only,
-- do not run yet)
--
-- Context: creating complete_trade granted EXECUTE to authenticated, but
-- didn't revoke Postgres's default EXECUTE-to-PUBLIC on new functions,
-- so anon and service_role held it too. auth.uid() being null already
-- blocks an unauthenticated caller functionally (the function's first
-- check returns an error), so this wasn't an active vulnerability, but
-- it's inconsistent with how tightly the RLS policies elsewhere scope
-- access, and there's no reason anon should be able to call this at all.
-- =============================================================================

revoke all on function complete_trade(uuid, uuid[]) from public;
revoke all on function complete_trade(uuid, uuid[]) from anon;

grant execute on function complete_trade(uuid, uuid[]) to authenticated;
