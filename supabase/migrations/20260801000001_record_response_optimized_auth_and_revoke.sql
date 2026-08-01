-- =============================================================================
-- Barter: close access-control gap on record_response_optimized
--
-- Context: same category of gap as check_and_create_match
-- (20260801000000) and predating the same explicit-revoke pattern used
-- since complete_trade (20260730201108). No auth check at all, and
-- aclexplode confirmed PUBLIC/anon both held EXECUTE -- an unauthenticated
-- caller could record a response as any user_uuid, and any authenticated
-- user could record one on another user's behalf.
--
-- Fix mirrors check_and_create_match's: a separate `is null` check ahead of
-- the comparison rather than a bare `auth.uid() != user_uuid`, since `if
-- NULL then` is false in plpgsql and would silently let a null auth.uid()
-- through a bare inequality check.
--
-- Purely additive against what the client already sends (the app always
-- passes the calling user's own id), so legitimate use is unaffected --
-- verified via a direct RPC regression test alongside check_and_create_match's.
--
-- Grant fix matches complete_trade_revoke_public: revoke from public and
-- anon, (re)grant to authenticated only.
-- =============================================================================

create or replace function record_response_optimized(user_uuid uuid, target_item_id uuid, response_direction text)
returns jsonb
language plpgsql
security definer
as $$
declare
  target_item_user_id uuid;
  target_item_is_system boolean := false;
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

  insert into responses (user_id, item_id, direction)
  values (user_uuid, target_item_id, response_direction)
  on conflict (user_id, item_id) do nothing;

  select i.user_id, u.is_system
  into target_item_user_id, target_item_is_system
  from items i
  join users u on u.id = i.user_id
  where i.id = target_item_id and i.is_active = true;

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
$$;

revoke all on function record_response_optimized(uuid, uuid, text) from public;
revoke all on function record_response_optimized(uuid, uuid, text) from anon;

grant execute on function record_response_optimized(uuid, uuid, text) to authenticated;
