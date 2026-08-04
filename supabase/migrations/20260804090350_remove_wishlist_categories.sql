-- =============================================================================
-- Barter: remove users.wishlist_categories (sync only: applied directly to
-- Barter2 via Supabase MCP in a planning chat; this file brings version
-- control back in line with what's already live)
--
-- Context: PRD §8 flags wishlist_categories as "an existing unused database
-- column with no supporting feature anywhere in the app" -- no codebase
-- reference ever read or wrote it outside of delete_own_account clearing it
-- on account deletion. Dropped outright rather than left as dead schema.
--
-- delete_own_account (20260801180945_delete_own_account.sql) is updated in
-- the same migration to stop clearing it, since the column it was clearing
-- no longer exists. No grant changes -- CREATE OR REPLACE FUNCTION doesn't
-- reset existing grants, and delete_own_account's (revoke public/anon,
-- grant authenticated) are unaffected by this body-only change.
--
-- Confirmed live via information_schema.columns (users) and
-- pg_get_functiondef (delete_own_account) before writing this file;
-- reproduced verbatim below.
-- =============================================================================

ALTER TABLE public.users DROP COLUMN wishlist_categories;

CREATE OR REPLACE FUNCTION public.delete_own_account()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  the_caller_id uuid := auth.uid();
  the_active_item_ids uuid[];
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  if not exists (select 1 from users where id = the_caller_id) then
    return jsonb_build_object('error', 'Account not found');
  end if;

  -- capture active items before deactivating, so we know what to notify about
  select array_agg(id) into the_active_item_ids
    from items
    where user_id = the_caller_id and status = 'active';

  update items
    set status = 'cancelled', is_active = false, updated_at = now()
    where user_id = the_caller_id and status = 'active';

  if the_active_item_ids is not null and array_length(the_active_item_ids, 1) > 0 then
    perform notify_connections_item_unavailable(the_active_item_ids, 'cancelled', null);
  end if;

  -- anonymize in place rather than deleting the row: connections, messages,
  -- trade_completions, reviews, and reports all keep resolving normally for
  -- the other participant, since nothing they reference disappears
  update users
    set username = 'Deleted User',
        bio = null,
        avatar_url = null,
        location = null,
        latitude = null,
        longitude = null,
        updated_at = now()
    where id = the_caller_id;

  -- remove the actual credential so the person can no longer log back in
  delete from auth.users where id = the_caller_id;

  return jsonb_build_object('success', true);
end;
$function$
;
