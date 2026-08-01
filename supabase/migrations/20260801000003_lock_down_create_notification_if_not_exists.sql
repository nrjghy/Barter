-- =============================================================================
-- Barter: lock down create_notification_if_not_exists
--
-- Context: second-pass EXECUTE-grant sweep. This is a SECURITY DEFINER
-- helper with zero validation of its own -- no auth check, no verification
-- that p_user_id has anything to do with the caller -- and aclexplode
-- showed PUBLIC/anon/authenticated all held EXECUTE. Any caller, signed in
-- or not, could inject an arbitrary notification (any type/title/content)
-- into any user's notifications feed.
--
-- Confirmed before touching it: zero references anywhere in the repo
-- (working tree, all branches, full git history) and zero other database
-- function calls it internally (a functiondef sweep across public found no
-- caller). It isn't currently wired to anything -- notifications elsewhere
-- (check_and_create_match, complete_trade, notify_item_cancelled, etc.) all
-- insert into public.notifications directly rather than through this
-- dedup-aware helper.
--
-- Since it's an unused-but-available helper rather than dead code with no
-- plausible future use (its dedup-window logic is genuinely useful for
-- anything that risks double-notifying), lock it down the same way
-- notify_connections_item_unavailable was (20260731164432) rather than
-- dropping it: revoke EXECUTE from public/anon/authenticated, leaving it
-- callable only by its owner (postgres) and service_role -- i.e. only from
-- inside other SECURITY DEFINER functions or trusted server-side contexts,
-- never directly from a client.
-- =============================================================================

revoke all on function create_notification_if_not_exists(uuid, text, text, text, jsonb, integer) from public;
revoke all on function create_notification_if_not_exists(uuid, text, text, text, jsonb, integer) from anon;
revoke all on function create_notification_if_not_exists(uuid, text, text, text, jsonb, integer) from authenticated;
