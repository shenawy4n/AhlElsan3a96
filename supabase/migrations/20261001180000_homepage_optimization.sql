-- Homepage Performance Optimization Migration
-- 1. Index for category counts aggregation
CREATE INDEX IF NOT EXISTS idx_providers_status_category ON public.providers(status, category_id);

-- 2. Index for reviews rating aggregation
CREATE INDEX IF NOT EXISTS idx_reviews_status_provider ON public.reviews(status, provider_id);

-- 3. Category Counts RPC (Database Aggregation)
CREATE OR REPLACE FUNCTION public.get_category_counts(p_area_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counts json;
BEGIN
  SELECT coalesce(json_object_agg(category_id, cnt), '{}'::json)
  INTO v_counts
  FROM (
    SELECT category_id, COUNT(*)::int AS cnt
    FROM public.providers
    WHERE status = 'active'
      AND (p_area_id IS NULL OR area_id = p_area_id)
    GROUP BY category_id
  ) c;
  RETURN v_counts;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_category_counts(uuid) TO anon, authenticated;

-- 4. Ratings Summary RPC (Database Aggregation)
CREATE OR REPLACE FUNCTION public.get_provider_ratings(p_provider_ids uuid[] DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ratings json;
BEGIN
  SELECT coalesce(json_object_agg(provider_id, json_build_object('average', avg_rating, 'count', rev_count)), '{}'::json)
  INTO v_ratings
  FROM (
    SELECT 
      r.provider_id,
      ROUND(AVG(r.rating)::numeric, 1)::float AS avg_rating,
      COUNT(*)::int AS rev_count
    FROM public.reviews r
    WHERE r.status = 'approved'
      AND (p_provider_ids IS NULL OR r.provider_id = ANY(p_provider_ids))
    GROUP BY r.provider_id
  ) r_summary;
  RETURN v_ratings;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_provider_ratings(uuid[]) TO anon, authenticated;

-- 5. Consolidated Homepage Data RPC
CREATE OR REPLACE FUNCTION public.get_homepage_data(p_area_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings json;
  v_categories json;
  v_areas json;
  v_category_counts json;
  v_featured_providers json;
  v_ratings json;
BEGIN
  -- 1. App settings
  SELECT coalesce(json_object_agg(key, value), '{}'::json)
  INTO v_settings
  FROM public.app_settings;

  -- 2. Categories
  SELECT coalesce(json_agg(c ORDER BY c.sort_order ASC, c.name ASC), '[]'::json)
  INTO v_categories
  FROM (
    SELECT id, name, icon, sort_order, status, unit_title
    FROM public.categories
    WHERE status = 'active'
  ) c;

  -- 3. Areas
  SELECT coalesce(json_agg(a ORDER BY a.name ASC), '[]'::json)
  INTO v_areas
  FROM (
    SELECT id, name, status
    FROM public.areas
    WHERE status = 'active'
  ) a;

  -- 4. Category provider counts (aggregated in PostgreSQL)
  SELECT coalesce(json_object_agg(category_id, cnt), '{}'::json)
  INTO v_category_counts
  FROM (
    SELECT category_id, COUNT(*)::int AS cnt
    FROM public.providers
    WHERE status = 'active'
      AND (p_area_id IS NULL OR area_id = p_area_id)
    GROUP BY category_id
  ) counts;

  -- 5. Featured providers (safe public fields ONLY, NO phone or whatsapp)
  SELECT coalesce(json_agg(fp), '[]'::json)
  INTO v_featured_providers
  FROM (
    SELECT 
      p.id,
      p.name,
      p.category_id,
      p.area_id,
      p.description,
      p.services,
      p.price_description,
      p.working_hours,
      p.photo_url,
      p.status,
      p.is_premium,
      p.premium_expires_at,
      p.experience_id,
      p.is_verified,
      p.has_whatsapp,
      p.created_at,
      p.updated_at,
      json_build_object('id', c.id, 'name', c.name) AS categories,
      json_build_object('id', a.id, 'name', a.name) AS areas,
      CASE WHEN eo.id IS NOT NULL THEN json_build_object('id', eo.id, 'label', eo.label) ELSE NULL END AS experience_options
    FROM public.providers p
    LEFT JOIN public.categories c ON c.id = p.category_id
    LEFT JOIN public.areas a ON a.id = p.area_id
    LEFT JOIN public.experience_options eo ON eo.id = p.experience_id
    WHERE p.status = 'active'
      AND p.is_premium = true
      AND (p_area_id IS NULL OR p.area_id = p_area_id)
    ORDER BY p.is_premium DESC, p.created_at DESC
    LIMIT 6
  ) fp;

  -- 6. Rating summaries for featured providers (aggregated in PostgreSQL)
  SELECT coalesce(json_object_agg(provider_id, json_build_object('average', avg_rating, 'count', rev_count)), '{}'::json)
  INTO v_ratings
  FROM (
    SELECT 
      r.provider_id,
      ROUND(AVG(r.rating)::numeric, 1)::float AS avg_rating,
      COUNT(*)::int AS rev_count
    FROM public.reviews r
    WHERE r.status = 'approved'
      AND r.provider_id IN (
        SELECT id FROM public.providers
        WHERE status = 'active'
          AND is_premium = true
          AND (p_area_id IS NULL OR area_id = p_area_id)
        ORDER BY is_premium DESC, created_at DESC
        LIMIT 6
      )
    GROUP BY r.provider_id
  ) r_summary;

  RETURN json_build_object(
    'settings', v_settings,
    'categories', v_categories,
    'areas', v_areas,
    'category_counts', v_category_counts,
    'featured_providers', v_featured_providers,
    'ratings', v_ratings
  );
END;
$$;

-- Grant execution to public and authenticated users
GRANT EXECUTE ON FUNCTION public.get_homepage_data(uuid) TO anon, authenticated;
