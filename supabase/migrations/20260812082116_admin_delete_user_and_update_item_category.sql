CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  the_caller_id uuid := auth.uid();
  the_caller_role text;
  the_active_item_ids uuid[];
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  select role into the_caller_role from users where id = the_caller_id;
  if the_caller_role is distinct from 'admin' then
    return jsonb_build_object('error', 'Only an admin can delete another user''s account');
  end if;

  if not exists (select 1 from users where id = target_user_id) then
    return jsonb_build_object('error', 'Account not found');
  end if;

  if target_user_id = the_caller_id then
    return jsonb_build_object('error', 'Use delete_own_account to delete your own account');
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

REVOKE EXECUTE ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_item_category(
  target_item_id uuid,
  new_category text,
  new_category_suggestion text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  the_caller_id uuid := auth.uid();
  the_caller_role text;
  the_valid_categories text[] := ARRAY[
    'Books', 'Toys & Games', 'Electronics', 'Clothing', 'Home & Garden',
    'Sports & Outdoors', 'Food & Meals', 'Art & Crafts', 'Music & Instruments',
    'Tools & Equipment', 'Beauty & Health', 'Collectibles', 'Other'
  ];
begin
  if the_caller_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  select role into the_caller_role from users where id = the_caller_id;
  if the_caller_role is distinct from 'admin' then
    return jsonb_build_object('error', 'Only an admin can reclassify an item''s category');
  end if;

  if not exists (select 1 from items where id = target_item_id) then
    return jsonb_build_object('error', 'Item not found');
  end if;

  if not (new_category = any(the_valid_categories)) then
    return jsonb_build_object('error', 'Not a valid category: ' || new_category);
  end if;

  if new_category_suggestion is not null and new_category != 'Other' then
    return jsonb_build_object('error', 'category_suggestion only applies when new_category is Other');
  end if;

  update items
    set category = new_category,
        category_suggestion = case when new_category = 'Other' then new_category_suggestion else null end,
        updated_at = now()
    where id = target_item_id;

  return jsonb_build_object('success', true, 'itemId', target_item_id, 'category', new_category);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_update_item_category(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_item_category(uuid, text, text) TO authenticated;
