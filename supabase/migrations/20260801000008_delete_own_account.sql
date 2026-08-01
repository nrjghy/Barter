-- =============================================================================
-- Barter: delete_own_account RPC + drop users_username_key
-- (sync only: both statements below were applied directly to Barter2 via
-- Supabase MCP in a planning chat; this file brings version control back in
-- line with what's already live)
--
-- Context: account deletion anonymizes the caller's own users row in place
-- ("Deleted User") rather than removing it, since connections, messages,
-- trade_completions, reviews, and reports all keep resolving normally for
-- the other participant that way. Every deleted account converging on the
-- same username would collide with the prior unique constraint on the
-- second deletion, so username uniqueness is dropped first. Confirmed
-- before dropping it that users_username_key is not referenced by any RLS
-- policy.
--
-- Confirmed live via
--   SELECT pg_get_functiondef(p.oid) FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'delete_own_account';
-- before writing this file, and reproduced verbatim below.
--
-- Active items are cancelled (not deleted) and routed through the same
-- notify_connections_item_unavailable fan-out manual cancel already uses, so
-- other connections mid-conversation about one of those items find out it's
-- gone. The auth.users row is deleted last so the caller's session becomes
-- invalid and they can't log back in.
-- =============================================================================

ALTER TABLE public.users DROP CONSTRAINT users_username_key;

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
        wishlist_categories = '{}',
        updated_at = now()
    where id = the_caller_id;

  -- remove the actual credential so the person can no longer log back in
  delete from auth.users where id = the_caller_id;

  return jsonb_build_object('success', true);
end;
$function$
;

revoke all on function public.delete_own_account() from public;
revoke all on function public.delete_own_account() from anon;

grant execute on function public.delete_own_account() to authenticated;
