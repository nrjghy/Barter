-- =============================================================================
-- Barter: daily like limit enforcement
-- (sync only: this was applied directly to Barter2 in a planning chat and
-- verified there this session; this file brings version control back in
-- line with what's already live.)
--
-- Context: can_user_swipe had been stripped to an unconditional `return
-- true` at some undocumented point, and record_response_optimized never
-- called it at all -- so there was no daily like limit enforcement
-- whatsoever, not even the original 50/day. This restores enforcement
-- against the new, tunable app_settings.daily_like_limit (previous
-- migration) rather than hardcoding the old 50.
--
-- can_user_swipe:
--   - auth.uid() = user_uuid check (defaults to false on a mismatch),
--     same "is null or !=" pattern as check_and_create_match /
--     record_response_optimized, so a null auth.uid() can't slip through
--     a bare inequality. Kept callable by `authenticated` directly, since
--     swipeService.ts's checkSwipeLimit() already calls it via
--     supabase.rpc() -- PUBLIC/anon EXECUTE revoked below.
--   - Lazily rolls users.daily_swipes over to 0 on a new day as a write
--     (not just a read), so checkSwipeLimit()'s existing call order
--     (can_user_swipe first, then a plain SELECT daily_swipes) shows a
--     correctly-reset count immediately with no frontend change needed.
--   - Compares against app_settings.daily_like_limit, falling back to
--     300 only if that row is ever somehow missing.
--
-- record_response_optimized:
--   - Calls can_user_swipe before allowing a 'like' specifically -- not
--     'pass', PRD §3 calls this a daily *like* limit -- returning the
--     exact string "Daily swipe limit reached" that swipeService.ts's
--     result.error.includes(...) check already looks for.
--   - Only increments daily_swipes after a genuinely new insert, guarded
--     against the existing ON CONFLICT DO NOTHING via RETURNING id, so a
--     duplicate/repeat like on the same item never double-counts.
--
-- Both fully verified this session with isolated test fixtures (cleaned
-- up by exact id afterward): a duplicate like doesn't double-count,
-- hitting exactly 300 then a 301st correctly errors, pass is unaffected
-- even at 300, simulating yesterday's last_swipe_date correctly triggers
-- a reset, a mismatched-user call to can_user_swipe returns false, and
-- anon gets permission-denied calling it directly.
--
-- Confirmed live via pg_get_functiondef for both functions, and
-- information_schema.routine_privileges for both (authenticated /
-- postgres / service_role only, no anon or public), before writing this
-- file; reproduced verbatim below.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_user_swipe(user_uuid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  the_daily_swipes int;
  the_daily_like_limit int;
begin
  if auth.uid() is null or auth.uid() != user_uuid then
    return false;
  end if;

  update users
  set daily_swipes = case when last_swipe_date = current_date then daily_swipes else 0 end,
      last_swipe_date = current_date
  where id = user_uuid
  returning daily_swipes into the_daily_swipes;

  select (value #>> '{}')::int into the_daily_like_limit
  from app_settings where key = 'daily_like_limit';

  return the_daily_swipes < coalesce(the_daily_like_limit, 300);
end;
$function$
;

REVOKE ALL ON FUNCTION public.can_user_swipe(uuid) FROM public;
REVOKE ALL ON FUNCTION public.can_user_swipe(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_user_swipe(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_response_optimized(user_uuid uuid, target_item_id uuid, response_direction text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_item_user_id uuid;
  target_item_is_system boolean := false;
  inserted_id uuid;
begin
  if auth.uid() is null or auth.uid() != user_uuid then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  if response_direction not in ('pass', 'like') then
    return jsonb_build_object('error', 'Invalid response direction');
  end if;

  if not exists (select 1 from users where id = user_uuid) then
    return jsonb_build_object('error', 'User not found');
  end if;

  if response_direction = 'like' and not public.can_user_swipe(user_uuid) then
    return jsonb_build_object('error', 'Daily swipe limit reached');
  end if;

  select i.user_id, u.is_system
  into target_item_user_id, target_item_is_system
  from items i
  join users u on u.id = i.user_id
  where i.id = target_item_id and i.is_active = true;

  if response_direction = 'like' and target_item_user_id is not null and exists (
    select 1 from user_blocks ub
    where (ub.blocker_id = user_uuid and ub.blocked_id = target_item_user_id)
       or (ub.blocker_id = target_item_user_id and ub.blocked_id = user_uuid)
  ) then
    return jsonb_build_object('error', 'Cannot like an item from a blocked user');
  end if;

  insert into responses (user_id, item_id, direction)
  values (user_uuid, target_item_id, response_direction)
  on conflict (user_id, item_id) do nothing
  returning id into inserted_id;

  if response_direction = 'like' and inserted_id is not null then
    update users set daily_swipes = daily_swipes + 1 where id = user_uuid;
  end if;

  if response_direction = 'like' and target_item_user_id is not null and target_item_is_system then
    return jsonb_build_object(
      'success', true,
      'isSystemItem', true,
      'matchCheckNeeded', false,
      'targetItemUserId', target_item_user_id
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'matchCheckNeeded', response_direction = 'like' and target_item_user_id is not null,
    'targetItemUserId', target_item_user_id
  );
end;
$function$
;

REVOKE ALL ON FUNCTION public.record_response_optimized(uuid, uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.record_response_optimized(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_response_optimized(uuid, uuid, text) TO authenticated;
