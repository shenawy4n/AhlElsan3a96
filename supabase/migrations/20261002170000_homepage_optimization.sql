-- Migration: Homepage Performance Optimization
-- Consolidates homepage data into a single queryable RPC
-- Performs database-side aggregations for category counts and ratings

CREATE OR REPLACE FUNCTION public.get_homepage_data()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'settings', COALESCE((
      SELECT json_object_agg(key, value)
      FROM public.app_settings
    ), '{}'::json),

    'categories', COALESCE((
      SELECT json_agg(c ORDER BY sort_order)
      FROM (
        SELECT id, name, icon, sort_order, status
        FROM public.categories
        WHERE status = 'active'
      ) c
    ), '[]'::json),

    'areas', COALESCE((
      SELECT json_agg(a ORDER BY name)
      FROM (
        SELECT id, name, status
        FROM public.areas
        WHERE status = 'active'
      ) a
    ), '[]'::json),

    'category_counts', COALESCE((
      SELECT json_object_agg(category_id, cnt)
      FROM (
        SELECT category_id, COUNT(*)::int AS cnt
        FROM public.providers
        WHERE status = 'active' AND category_id IS NOT NULL
        GROUP BY category_id
      ) cc
    ), '{}'::json),

    'featured_providers', COALESCE((
      SELECT json_agg(fp)
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
          (
            SELECT json_build_object('id', c.id, 'name', c.name)
            FROM public.categories c
            WHERE c.id = p.category_id
          ) AS categories,
          (
            SELECT json_build_object('id', a.id, 'name', a.name)
            FROM public.areas a
            WHERE a.id = p.area_id
          ) AS areas,
          (
            SELECT json_build_object('id', e.id, 'label', e.label)
            FROM public.experience_options e
            WHERE e.id = p.experience_id
          ) AS experience_options,
          COALESCE(rs.avg_rating, 0) AS average_rating,
          COALESCE(rs.rev_count, 0) AS review_count
        FROM public.providers p
        LEFT JOIN (
          SELECT
            provider_id,
            ROUND(AVG(rating)::numeric, 1)::float AS avg_rating,
            COUNT(*)::int AS rev_count
          FROM public.reviews
          WHERE status = 'approved'
          GROUP BY provider_id
        ) rs ON rs.provider_id = p.id
        WHERE p.status = 'active' AND p.is_premium = true
        ORDER BY p.created_at DESC
        LIMIT 6
      ) fp
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;

-- Allow anon and authenticated callers to execute get_homepage_data()
GRANT EXECUTE ON FUNCTION public.get_homepage_data() TO anon, authenticated, service_role;

-- Performance indexes for aggregations
CREATE INDEX IF NOT EXISTS idx_providers_status_category ON public.providers(status, category_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status_provider ON public.reviews(status, provider_id);
