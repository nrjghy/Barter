-- Replaces get_items_browse's pure-recency ordering with distance-first,
-- owner-spread ranking. Based on the LIVE definition (confirmed via
-- Supabase MCP) -- the checked-in migration file
-- (20260811175357_get_items_browse_listing_type_and_giveaway_value_exemption.sql)
-- is stale, missing the p_include_unrated parameter/clause that already
-- exists live. This migration CREATE OR REPLACEs on top of the live
-- definition rather than editing that old file.
--
-- Ranking: approximate distance from (p_lat, p_lng) using the same
-- equirectangular scaling the existing bounds CTE already uses (no
-- PostGIS). NULL lat/lng on either side falls back to a NULL distance,
-- sorted last -- recency (created_at DESC) is the tiebreak/fallback in
-- every case. row_number() OVER (PARTITION BY user_id ORDER BY distance,
-- created_at DESC) caps each owner to one card per "rank" position, so a
-- single owner (the curator account holding ~100 items chief among them)
-- can't fill consecutive cards -- no separate curator cap needed.
--
-- Also appends u.is_curator AS user_is_curator, needed client-side for
-- analytics properties (see itemService.ts's transform / ItemWithUser.userIsCurator).
--
-- DROP FUNCTION is required (not just CREATE OR REPLACE) since appending a
-- column changes the RETURNS TABLE row type; Postgres won't let a plain
-- REPLACE change that shape. Default privileges after DROP+CREATE match
-- what was already live (public/anon/authenticated/service_role can all
-- execute it, same as get_items_browse's original GRANT EXECUTE ... TO PUBLIC).
DROP FUNCTION IF EXISTS public.get_items_browse(double precision, double precision, integer, text[], text[], uuid, numeric, numeric, integer, numeric, boolean, integer, integer);

CREATE FUNCTION public.get_items_browse(p_lat double precision, p_lng double precision, p_radius_km integer, p_categories text[] DEFAULT NULL::text[], p_conditions text[] DEFAULT NULL::text[], p_exclude_user_id uuid DEFAULT NULL::uuid, p_min_value numeric DEFAULT NULL::numeric, p_max_value numeric DEFAULT NULL::numeric, p_max_age_days integer DEFAULT NULL::integer, p_min_rating numeric DEFAULT NULL::numeric, p_include_unrated boolean DEFAULT true, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, description text, category text, condition text, listing_type text, image_urls text[], tags text[], is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone, user_id uuid, estimated_value numeric, value_currency text, source_url text, latitude numeric, longitude numeric, location text, source_provider text, user_username text, user_location text, user_avatar_url text, user_rating numeric, user_is_curator boolean)
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
  ),
  matched AS (
    SELECT
      i.id, i.title, i.description, i.category, i.condition, i.listing_type, i.image_urls, i.tags, i.is_active,
      i.created_at, i.updated_at, i.user_id, i.estimated_value, i.value_currency, i.source_url,
      i.latitude, i.longitude, i.location, i.source_provider,
      u.username AS user_username, u.location AS user_location, u.avatar_url AS user_avatar_url,
      u.rating AS user_rating, u.is_curator AS user_is_curator,
      CASE
        WHEN p_lat IS NULL OR p_lng IS NULL OR i.latitude IS NULL OR i.longitude IS NULL THEN NULL
        ELSE sqrt(
          power((i.latitude::double precision - p_lat) * 111.0, 2) +
          power((i.longitude::double precision - p_lng) * 111.0 * GREATEST(0.1, COS(RADIANS(p_lat))), 2)
        )
      END AS distance_km
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
      -- An item committed to a currently-agreed offer is off the market
      -- entirely until that offer resolves (completes or gets withdrawn) --
      -- confirmed scope: hidden once agreed, not while merely pending.
      AND NOT EXISTS (
        SELECT 1 FROM public.offer_items oi
        JOIN public.offers o ON o.id = oi.offer_id
        WHERE oi.item_id = i.id AND o.status = 'agreed'
      )
      AND (p_exclude_user_id IS NULL OR i.user_id <> p_exclude_user_id)
      AND (p_categories IS NULL OR i.category = ANY(p_categories))
      AND (p_conditions IS NULL OR i.condition = ANY(p_conditions))
      AND (p_min_value IS NULL OR i.estimated_value >= p_min_value OR i.listing_type = 'giveaway')
      AND (p_max_value IS NULL OR i.estimated_value <= p_max_value OR i.listing_type = 'giveaway')
      AND (p_max_age_days IS NULL OR i.created_at >= now() - (p_max_age_days || ' days')::interval)
      AND (COALESCE(p_include_unrated, true) OR u.rating IS NOT NULL)
      AND (p_min_rating IS NULL OR u.rating IS NULL OR u.rating >= p_min_rating)
      AND (
        b.min_lat IS NULL
        OR (i.latitude IS NOT NULL AND i.longitude IS NOT NULL
            AND i.latitude BETWEEN b.min_lat AND b.max_lat
            AND i.longitude BETWEEN b.min_lng AND b.max_lng)
      )
  ),
  ranked AS (
    SELECT
      matched.*,
      row_number() OVER (
        PARTITION BY user_id
        ORDER BY distance_km ASC NULLS LAST, created_at DESC
      ) AS owner_rank
    FROM matched
  )
  SELECT
    id, title, description, category, condition, listing_type, image_urls, tags, is_active,
    created_at, updated_at, user_id, estimated_value, value_currency, source_url,
    latitude, longitude, location, source_provider,
    user_username, user_location, user_avatar_url, user_rating, user_is_curator
  FROM ranked
  ORDER BY owner_rank ASC, distance_km ASC NULLS LAST, created_at DESC
  LIMIT COALESCE(p_limit, 20)
  OFFSET COALESCE(p_offset, 0);
$function$;
