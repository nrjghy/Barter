-- admin_update_item's diff builder appended bare string literals ('Tags
-- updated', 'Photos updated') to a text[] variable with ||. Postgres
-- resolves an untyped literal used with || against text[] as another array
-- literal to concatenate, not a scalar element, so it tried to parse
-- 'Tags updated' as array syntax and raised "malformed array literal".
-- Cast the literals to text explicitly so they append as single elements.

CREATE OR REPLACE FUNCTION public.admin_update_item(
  target_item_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_category_suggestion text,
  p_condition text,
  p_estimated_value numeric,
  p_value_currency text,
  p_tags text[],
  p_image_urls text[],
  p_location text,
  p_latitude numeric,
  p_longitude numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  the_old_title text;
  the_old_description text;
  the_old_category text;
  the_old_condition text;
  the_old_estimated_value numeric;
  the_old_value_currency text;
  the_old_location text;
  the_old_tags text[];
  the_old_image_urls text[];
  the_owner_id uuid;
  the_diff text[] := '{}';
begin
  if not exists (select 1 from public.users where id = auth.uid() and role = 'admin') then
    return jsonb_build_object('error', 'Only an admin can edit another user''s listing');
  end if;

  select title, description, category, condition, estimated_value, value_currency, location, tags, image_urls, user_id
  into the_old_title, the_old_description, the_old_category, the_old_condition, the_old_estimated_value,
       the_old_value_currency, the_old_location, the_old_tags, the_old_image_urls, the_owner_id
  from items where id = target_item_id;

  if the_owner_id is null then
    return jsonb_build_object('error', 'Item not found');
  end if;

  update items set
    title = p_title,
    description = p_description,
    category = p_category,
    category_suggestion = p_category_suggestion,
    condition = p_condition,
    estimated_value = p_estimated_value,
    value_currency = p_value_currency,
    tags = p_tags,
    image_urls = p_image_urls,
    location = p_location,
    latitude = p_latitude,
    longitude = p_longitude,
    updated_at = now()
  where id = target_item_id;

  if the_old_title is distinct from p_title then
    the_diff := the_diff || ('Title: "' || coalesce(the_old_title, '') || '" → "' || coalesce(p_title, '') || '"');
  end if;
  if the_old_description is distinct from p_description then
    the_diff := the_diff || ('Description: "' || coalesce(the_old_description, '') || '" → "' || coalesce(p_description, '') || '"');
  end if;
  if the_old_category is distinct from p_category then
    the_diff := the_diff || ('Category: "' || coalesce(the_old_category, '') || '" → "' || coalesce(p_category, '') || '"');
  end if;
  if the_old_condition is distinct from p_condition then
    the_diff := the_diff || ('Condition: "' || coalesce(the_old_condition, '') || '" → "' || coalesce(p_condition, '') || '"');
  end if;
  if the_old_estimated_value is distinct from p_estimated_value then
    the_diff := the_diff || ('Estimated value: "' || coalesce(the_old_estimated_value::text, '') || '" → "' || coalesce(p_estimated_value::text, '') || '"');
  end if;
  if the_old_value_currency is distinct from p_value_currency then
    the_diff := the_diff || ('Currency: "' || coalesce(the_old_value_currency, '') || '" → "' || coalesce(p_value_currency, '') || '"');
  end if;
  if the_old_location is distinct from p_location then
    the_diff := the_diff || ('Location: "' || coalesce(the_old_location, '') || '" → "' || coalesce(p_location, '') || '"');
  end if;
  if the_old_tags is distinct from p_tags then
    the_diff := the_diff || 'Tags updated'::text;
  end if;
  if the_old_image_urls is distinct from p_image_urls then
    the_diff := the_diff || 'Photos updated'::text;
  end if;

  if array_length(the_diff, 1) > 0 and the_owner_id != auth.uid() then
    insert into notifications (user_id, type, title, content, data)
    values (
      the_owner_id,
      'admin_item_edit',
      'An admin updated your listing',
      array_to_string(the_diff, '; '),
      jsonb_build_object('itemId', target_item_id)
    );
  end if;

  return jsonb_build_object('success', true, 'itemId', target_item_id);
end;
$function$;
