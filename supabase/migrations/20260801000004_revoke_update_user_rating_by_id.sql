-- =============================================================================
-- Barter: revoke EXECUTE on update_user_rating(user_id, new_rating)
--
-- Context: second-pass EXECUTE-grant sweep. There are two same-named
-- functions in this schema and only one of them is legitimate:
--
-- - update_user_rating() -- the trigger function attached to
--   update_user_rating_trigger (AFTER INSERT on reviews), which recomputes
--   rating/rating_sum/total_ratings from the actual reviews table. This is
--   the real aggregate and is untouched by this migration.
--
-- - update_user_rating(user_id uuid, new_rating integer) -- an older,
--   parallel implementation that isn't a trigger at all. It's a plain
--   callable function, not SECURITY DEFINER, so it runs as the calling
--   role -- but the `users` table's "Users can update own data" RLS policy
--   is self-scoped (auth.uid() = id) with no column restriction, and this
--   function has zero validation that a real review exists behind the
--   rating it's applying. Any authenticated user could call
--   update_user_rating(auth.uid(), 5) directly and inflate their own
--   rating arbitrarily, bypassing the review system entirely.
--
-- Confirmed before touching it: no client code, migration, or other
-- database function calls update_user_rating(uuid, integer) anywhere --
-- the review-writing feature that would be its legitimate caller hasn't
-- been built yet (per the project plan). Revoking rather than dropping for
-- now since a real caller is coming; when review-writing is built, it needs
-- its own SECURITY DEFINER RPC that validates a review was actually
-- submitted (right reviewer, right connection, one rating per review) before
-- recomputing the aggregate -- not a re-grant of this function, which has
-- no such validation and was never designed with a hostile caller in mind.
-- =============================================================================

revoke all on function update_user_rating(uuid, integer) from public;
revoke all on function update_user_rating(uuid, integer) from anon;
revoke all on function update_user_rating(uuid, integer) from authenticated;
