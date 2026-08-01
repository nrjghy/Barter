-- =============================================================================
-- Barter: drop orphaned trigger function send_initial_match_message
--
-- Context: second-pass EXECUTE-grant sweep. This is a trigger function
-- (returns trigger) from the pre-connection-model matches era -- it inserts
-- into public.messages using a match_id column that no longer exists (the
-- connection-model rewrite, 20260725000000, replaced matches with
-- connections/trade_completions and messages now keys off connection_id).
-- Calling it today would fail immediately on the missing column.
--
-- Confirmed before dropping: not attached to any trigger on any table
-- (pg_trigger has zero rows with this function as tgfoid -- it's not
-- currently wired to fire on anything), and no other function or repo code
-- references it. Orphaned dead code left over from the rewrite, not
-- something dropping the old matches trigger missed removing -- there is
-- no live trigger to drop alongside it.
-- =============================================================================

drop function if exists send_initial_match_message();
