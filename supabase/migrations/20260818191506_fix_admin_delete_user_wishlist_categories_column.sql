-- admin_delete_user was written to mirror delete_own_account's body, but
-- copied an older version of it that still cleared wishlist_categories --
-- that column was dropped in remove_wishlist_categories, and the live
-- delete_own_account no longer references it. Match the live definition.

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  the_target_role text;
  the_active_item_ids uuid[];
begin
  if not exists (select 1 from public.users where id = auth.uid() and role = 'admin') then
    return jsonb_build_object('error', 'Only an admin can delete another user''s account');
  end if;

  if target_user_id = auth.uid() then
    return jsonb_build_object('error', 'Use delete_own_account to delete your own account');
  end if;

  select role into the_target_role from users where id = target_user_id;
  if the_target_role is null then
    return jsonb_build_object('error', 'Account not found');
  end if;

  if the_target_role = 'admin' then
    return jsonb_build_object('error', 'This user is an admin -- demote them via admin_set_user_role before deleting');
  end if;

  -- capture active items before deactivating, so we know what to notify about
  select array_agg(id) into the_active_item_ids
    from items
    where user_id = target_user_id and status = 'active';

  update items
    set status = 'cancelled', is_active = false, updated_at = now()
    where user_id = target_user_id and status = 'active';

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
    where id = target_user_id;

  -- remove the actual credential so the person can no longer log back in
  delete from auth.users where id = target_user_id;

  return jsonb_build_object('success', true, 'deletedUserId', target_user_id);
end;
$function$;
