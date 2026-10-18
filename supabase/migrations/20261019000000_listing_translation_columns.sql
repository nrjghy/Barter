-- Listing translation: schema. Originals are never overwritten; English is stored beside them.

-- 1. Translation columns on items.
--    original_language: 'pl', 'en' or another ISO code. NULL means "not processed yet".
--    title_en / description_en: English version. Stay NULL when the original is already English.
--    translated_at: when the English text was produced. NULL while pending.
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS original_language text,
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS description_en text,
  ADD COLUMN IF NOT EXISTS translated_at timestamptz;

-- 2. Account-level display setting. NULL = automatic (follow the browser language).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS show_listings_in_english boolean;

-- 3. Guard on the translation columns.
--    - If the title or description changes (any role, including SECURITY DEFINER functions such as
--      admin_update_item), the old translation is stale, so all four columns are cleared (pending again).
--    - Signed-in users and anon can never write the columns directly: forced to NULL on insert,
--      kept as they were on update.
--    The translate-item Edge Function (service_role) only writes the four translation columns,
--    never title or description, so its writes pass through.
CREATE OR REPLACE FUNCTION public.guard_item_translation_columns()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Any role: changed text makes the stored translation stale.
  IF TG_OP = 'UPDATE' AND (NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description) THEN
    NEW.original_language := NULL;
    NEW.title_en := NULL;
    NEW.description_en := NULL;
    NEW.translated_at := NULL;
    RETURN NEW;
  END IF;

  -- Signed-in users and anon can never write translation columns directly.
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.original_language := NULL;
      NEW.title_en := NULL;
      NEW.description_en := NULL;
      NEW.translated_at := NULL;
    ELSE
      NEW.original_language := OLD.original_language;
      NEW.title_en := OLD.title_en;
      NEW.description_en := OLD.description_en;
      NEW.translated_at := OLD.translated_at;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS items_guard_translation ON public.items;
CREATE TRIGGER items_guard_translation
  BEFORE INSERT OR UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.guard_item_translation_columns();

-- 4. get_items_browse: production's current definition plus three new return columns at the end.
--    The return type changes, so the function is dropped and recreated.
DROP FUNCTION IF EXISTS public.get_items_browse(double precision, double precision, integer, text[], text[], uuid, numeric, numeric, integer, numeric, boolean, uuid[], integer, integer);

CREATE FUNCTION public.get_items_browse(p_lat double precision, p_lng double precision, p_radius_km integer, p_categories text[] DEFAULT NULL::text[], p_conditions text[] DEFAULT NULL::text[], p_exclude_user_id uuid DEFAULT NULL::uuid, p_min_value numeric DEFAULT NULL::numeric, p_max_value numeric DEFAULT NULL::numeric, p_max_age_days integer DEFAULT NULL::integer, p_min_rating numeric DEFAULT NULL::numeric, p_include_unrated boolean DEFAULT true, p_group_ids uuid[] DEFAULT NULL::uuid[], p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, description text, category text, condition text, listing_type text, image_urls text[], tags text[], is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone, user_id uuid, estimated_value numeric, value_currency text, source_url text, latitude numeric, longitude numeric, location text, source_provider text, user_username text, user_location text, user_avatar_url text, user_rating numeric, user_is_curator boolean, original_language text, title_en text, description_en text)
 LANGUAGE sql
AS $function$
  WITH eff AS (
    -- Effective radius: a NULL or non-positive radius defaults to 50 km whenever
    -- the viewer has coordinates, so the slider's 0 km position cannot switch the
    -- distance filter off. No coordinates means no bounds check.
    SELECT
      CASE
        WHEN p_lat IS NULL OR p_lng IS NULL THEN NULL
        WHEN p_radius_km IS NULL OR p_radius_km <= 0 THEN 50
        ELSE p_radius_km
      END AS km
  ),
  bounds AS (
    SELECT
      CASE WHEN e.km IS NULL THEN NULL ELSE p_lat - (e.km::double precision / 111.0) END AS min_lat,
      CASE WHEN e.km IS NULL THEN NULL ELSE p_lat + (e.km::double precision / 111.0) END AS max_lat,
      CASE WHEN e.km IS NULL THEN NULL ELSE p_lng - (e.km::double precision / (111.0 * GREATEST(0.1, COS(RADIANS(p_lat))))) END AS min_lng,
      CASE WHEN e.km IS NULL THEN NULL ELSE p_lng + (e.km::double precision / (111.0 * GREATEST(0.1, COS(RADIANS(p_lat))))) END AS max_lng
    FROM eff e
  ),
  matched AS (
    SELECT
      i.id, i.title, i.description, i.category, i.condition, i.listing_type, i.image_urls, i.tags, i.is_active,
      i.created_at, i.updated_at, i.user_id, i.estimated_value, i.value_currency, i.source_url,
      i.latitude, i.longitude, i.location, i.source_provider,
      i.original_language, i.title_en, i.description_en,
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
      AND NOT EXISTS (
        SELECT 1 FROM public.offer_items oi
        JOIN public.offers o ON o.id = oi.offer_id
        WHERE oi.item_id = i.id AND o.status = 'agreed'
      )
      AND (
        (p_group_ids IS NULL AND i.is_public = true)
        OR (p_group_ids IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.item_groups ig
          WHERE ig.item_id = i.id AND ig.group_id = ANY(p_group_ids)
        ))
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
    user_username, user_location, user_avatar_url, user_rating, user_is_curator,
    original_language, title_en, description_en
  FROM ranked
  ORDER BY owner_rank ASC, distance_km ASC NULLS LAST, created_at DESC
  LIMIT COALESCE(p_limit, 20)
  OFFSET COALESCE(p_offset, 0);
$function$;

-- Grants: same as production for this function (PUBLIC, anon, authenticated, service_role).
GRANT EXECUTE ON FUNCTION public.get_items_browse(double precision, double precision, integer, text[], text[], uuid, numeric, numeric, integer, numeric, boolean, uuid[], integer, integer) TO PUBLIC, anon, authenticated, service_role;
