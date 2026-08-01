-- =============================================================================
-- Barter: enforce user_blocks across Discover, responses, and matching
-- (sync only: this was applied directly to Barter2 via Supabase MCP in a
-- planning chat; this file brings version control back in line with what's
-- already live)
--
-- Context: user_blocks previously only stopped a blocked pair from seeing
-- each other in Chat (ConnectionService.endConnection / the connections
-- table). Nothing stopped a blocked item from still surfacing in Discover,
-- being liked, or forming a new connection -- a block didn't actually
-- prevent the blocked party from re-initiating contact through those paths.
-- This migration closes all three:
--
--   - get_items_browse: excludes any item whose owner has a mutual
--     user_blocks row with the caller (either direction), same pattern as
--     the is_system/is_demo exclusion already there.
--   - record_response_optimized: a 'like' against a blocked user's item is
--     rejected with an error *before* the response row is inserted, not
--     just before the match check -- so no stray 'like' response persists
--     for a blocked pair.
--   - check_and_create_match: rejects forming a connection between a
--     blocked pair, returning {matchCreated: false, reason: 'blocked'}
--     rather than an error, since this path can be reached via a stale
--     client-side like that predates the block.
--
-- Confirmed live via
--   SELECT pg_get_functiondef(p.oid) FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname IN
--     ('get_items_browse', 'record_response_optimized', 'check_and_create_match');
-- before writing this file, and reproduced verbatim below. Grants on all
-- three are unchanged by this migration (confirmed via
-- information_schema.routine_privileges) -- logic-only change.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_items_browse(p_lat double precision, p_lng double precision, p_radius_km integer, p_categories text[] DEFAULT NULL::text[], p_conditions text[] DEFAULT NULL::text[], p_exclude_user_id uuid DEFAULT NULL::uuid, p_min_value numeric DEFAULT NULL::numeric, p_max_value numeric DEFAULT NULL::numeric, p_max_age_days integer DEFAULT NULL::integer, p_min_rating numeric DEFAULT NULL::numeric, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, description text, category text, condition text, image_urls text[], tags text[], is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone, user_id uuid, estimated_value numeric, value_currency text, source_url text, latitude numeric, longitude numeric, location text, source_provider text, user_username text, user_location text, user_avatar_url text, user_rating numeric)
 LANGUAGE sql
AS $function$
  WITH bounds AS (
    SELECT
      CASE WHEN p_radius_km IS NULL OR p_radius_km <= 0 OR p_lat IS NULL OR p_lng IS NULL
           THEN NULL ELSE p_lat - (p_radius_km::double precision / 111.0) END AS min_lat,
      CASE WHEN p_radius_km IS NULL OR p_radius_km <= 0 OR p_lat IS NULL OR p_lng IS NULL
           THEN NULL ELSE p_lat + (p_radius_km::double precision / 111.0) END AS max_lat,
      CASE WHEN p_radius_km IS NULL OR p_radius_km <= 0 OR p_lat IS NULL OR p_lng IS NULL
           THEN NULL ELSE p_lng - (p_radius_km::double precision / (111.0 * GREATEST(0.1, COS(RADIANS(p_lat))))) END AS min_lng,
      CASE WHEN p_radius_km IS NULL OR p_radius_km <= 0 OR p_lat IS NULL OR p_lng IS NULL
           THEN NULL ELSE p_lng + (p_radius_km::double precision / (111.0 * GREATEST(0.1, COS(RADIANS(p_lat))))) END AS max_lng
  )
  SELECT
    i.id, i.title, i.description, i.category, i.condition, i.image_urls, i.tags, i.is_active,
    i.created_at, i.updated_at, i.user_id, i.estimated_value, i.value_currency, i.source_url,
    i.latitude, i.longitude, i.location, i.source_provider,
    u.username AS user_username, u.location AS user_location, u.avatar_url AS user_avatar_url,
    u.rating AS user_rating
  FROM public.items i
  JOIN public.users u ON u.id = i.user_id
  CROSS JOIN bounds b
  WHERE i.is_active = true
    AND NOT COALESCE(u.is_system, false)
    AND NOT COALESCE(u.is_demo, false)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks ub
      WHERE (ub.blocker_id = auth.uid() AND ub.blocked_id = i.user_id)
         OR (ub.blocker_id = i.user_id AND ub.blocked_id = auth.uid())
    )
    AND (p_exclude_user_id IS NULL OR i.user_id <> p_exclude_user_id)
    AND (p_categories IS NULL OR i.category = ANY(p_categories))
    AND (p_conditions IS NULL OR i.condition = ANY(p_conditions))
    AND (p_min_value IS NULL OR i.estimated_value >= p_min_value)
    AND (p_max_value IS NULL OR i.estimated_value <= p_max_value)
    AND (p_max_age_days IS NULL OR i.created_at >= now() - (p_max_age_days || ' days')::interval)
    AND (p_min_rating IS NULL OR u.rating >= p_min_rating)
    AND (
      b.min_lat IS NULL
      OR (i.latitude IS NOT NULL AND i.longitude IS NOT NULL
          AND i.latitude BETWEEN b.min_lat AND b.max_lat
          AND i.longitude BETWEEN b.min_lng AND b.max_lng)
    )
  ORDER BY i.created_at DESC
  LIMIT COALESCE(p_limit, 20)
  OFFSET COALESCE(p_offset, 0);
$function$
;

CREATE OR REPLACE FUNCTION public.record_response_optimized(user_uuid uuid, target_item_id uuid, response_direction text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  on conflict (user_id, item_id) do nothing;

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

CREATE OR REPLACE FUNCTION public.check_and_create_match(responder_user_id uuid, target_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  target_item_user_id uuid;
  responder_item_id uuid;
  sorted_user_id_1 uuid;
  sorted_user_id_2 uuid;
  the_connection_id uuid;
  the_interest_id uuid;
  is_new_connection boolean;
begin
  if auth.uid() is null or auth.uid() != responder_user_id then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  select user_id into target_item_user_id
  from items
  where id = target_item_id and is_active = true;

  if target_item_user_id is null then
    return jsonb_build_object('error', 'Target item not found or inactive');
  end if;

  if exists (
    select 1 from user_blocks ub
    where (ub.blocker_id = responder_user_id and ub.blocked_id = target_item_user_id)
       or (ub.blocker_id = target_item_user_id and ub.blocked_id = responder_user_id)
  ) then
    return jsonb_build_object('matchCreated', false, 'reason', 'blocked');
  end if;

  if not exists (
    select 1 from responses
    where user_id = responder_user_id
      and item_id = target_item_id
      and direction = 'like'
  ) then
    return jsonb_build_object('error', 'You have not liked this item');
  end if;

  select i.id into responder_item_id
  from items i
  join responses r on r.item_id = i.id
  where i.user_id = responder_user_id
    and i.is_active = true
    and r.user_id = target_item_user_id
    and r.direction = 'like'
  limit 1;

  if responder_item_id is null then
    return jsonb_build_object('matchCreated', false, 'reason', 'No mutual like found');
  end if;

  select user_id_1, user_id_2 into sorted_user_id_1, sorted_user_id_2
  from sort_user_pair(responder_user_id, target_item_user_id);

  insert into connections (user_id_1, user_id_2)
  values (sorted_user_id_1, sorted_user_id_2)
  on conflict (user_id_1, user_id_2) do nothing
  returning id into the_connection_id;

  if the_connection_id is not null then
    is_new_connection := true;
  else
    is_new_connection := false;
    select id into the_connection_id
    from connections
    where user_id_1 = sorted_user_id_1 and user_id_2 = sorted_user_id_2;
  end if;

  insert into connection_item_interests (connection_id, item_id_1, item_id_2)
  values (the_connection_id, responder_item_id, target_item_id)
  on conflict (connection_id, item_id_1, item_id_2) do nothing
  returning id into the_interest_id;

  if the_interest_id is null then
    return jsonb_build_object(
      'matchCreated', true,
      'connectionId', the_connection_id,
      'isNewConnection', is_new_connection,
      'responderItemId', responder_item_id,
      'targetItemId', target_item_id
    );
  end if;

  if is_new_connection then
    insert into notifications (user_id, type, title, content, data)
    values
      (target_item_user_id, 'match', 'It''s a Match!',
       'You both liked each other''s items! Start chatting now.',
       jsonb_build_object('connectionId', the_connection_id)),
      (responder_user_id, 'match', 'It''s a Match!',
       'You both liked each other''s items! Start chatting now.',
       jsonb_build_object('connectionId', the_connection_id));
  else
    insert into notifications (user_id, type, title, content, data)
    values
      (target_item_user_id, 'match', 'Another Mutual Like',
       'You both liked another item! Check your chat for the new item.',
       jsonb_build_object('connectionId', the_connection_id)),
      (responder_user_id, 'match', 'Another Mutual Like',
       'You both liked another item! Check your chat for the new item.',
       jsonb_build_object('connectionId', the_connection_id));
  end if;

  return jsonb_build_object(
    'matchCreated', true,
    'connectionId', the_connection_id,
    'isNewConnection', is_new_connection,
    'responderItemId', responder_item_id,
    'targetItemId', target_item_id
  );
end;
$function$
;
