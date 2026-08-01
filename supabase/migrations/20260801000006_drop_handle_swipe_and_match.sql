-- =============================================================================
-- Barter: drop handle_swipe_and_match
--
-- Context: second-pass EXECUTE-grant sweep, closing out an item flagged
-- (but not acted on) since 20260725000002's rename pass: "handle_swipe_and_match
-- is already-confirmed dead code, a drop candidate rather than a rename
-- candidate." It operates entirely on the pre-connection-model swipes/matches
-- tables (record into swipes, look for mutual swipes, insert into matches),
-- superseded by record_response_optimized/check_and_create_match and the
-- responses/connections tables.
--
-- Re-confirmed now with the same rigor applied to mark_items_as_traded
-- (20260801000002): zero references in the current repo, zero across every
-- local and remote branch, zero in the full git history beyond the prior
-- dead-code commentary itself, and no other database function calls it.
-- Dropped entirely rather than continuing to flag it.
-- =============================================================================

drop function if exists handle_swipe_and_match(uuid, uuid, text, boolean);
