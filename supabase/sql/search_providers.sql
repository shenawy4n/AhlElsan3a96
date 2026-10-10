-- ==============================================================================
-- SEARCH PROVIDERS RPC & ARABIC TEXT NORMALIZATION
-- File: supabase/sql/search_providers.sql
-- Review and run this migration in your Supabase SQL Editor.
-- ==============================================================================

-- 1. Immutable Arabic text normalizer function
-- Maps variants: أإآٱ -> ا, ى -> ي, ة -> ه
-- Strips Tashkeel (harakat), Tatweel (kashida), control characters
-- Lowercases and collapses multiple spaces into a single space
CREATE OR REPLACE FUNCTION public.normalize_ar(input_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
DECLARE
  cleaned text;
BEGIN
  IF input_text IS NULL OR length(trim(input_text)) = 0 THEN
    RETURN '';
  END IF;

  cleaned := input_text;

  -- Remove control characters
  cleaned := regexp_replace(cleaned, '[\u0000-\u001F\u007F-\u009F]', '', 'g');

  -- Remove Tashkeel (Arabic diacritics / harakat) & Tatweel (Kashida \u0640)
  cleaned := regexp_replace(cleaned, '[\u064B-\u065F\u0670\u0640]', '', 'g');

  -- Normalize Alef variants to bare Alef (ا)
  cleaned := regexp_replace(cleaned, '[أإآٱ]', 'ا', 'g');

  -- Normalize Alef Maqsura (ى) to Yaa (ي)
  cleaned := regexp_replace(cleaned, 'ى', 'ي', 'g');

  -- Normalize Taa Marbuta (ة) to Haa (ه)
  cleaned := regexp_replace(cleaned, 'ة', 'ه', 'g');

  -- Normalize Hamza variants
  cleaned := regexp_replace(cleaned, '[ؤئ]', 'ء', 'g');

  -- Lowercase and collapse consecutive whitespace
  cleaned := lower(trim(regexp_replace(cleaned, '\s+', ' ', 'g')));

  RETURN cleaned;
END;
$$;

COMMENT ON FUNCTION public.normalize_ar(text) IS 'Normalizes Arabic text by unifying Alef/Yaa/Haa variants, stripping tashkeel/tatweel, and collapsing whitespace.';


-- 2. Secure Search Function (SECURITY DEFINER with restricted search_path)
-- Searches name, description, category name, services array, and area name
-- Exclusively filters active providers and returns ONLY safe public card columns
-- (Never exposes phone, email, notes, or internal attributes)
CREATE OR REPLACE FUNCTION public.search_providers(
  q text DEFAULT NULL,
  p_category uuid DEFAULT NULL,
  p_area uuid DEFAULT NULL,
  p_available_now boolean DEFAULT FALSE,
  p_emergency boolean DEFAULT FALSE,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  category_id uuid,
  area_id uuid,
  photo_url text,
  status text,
  is_premium boolean,
  premium_expires_at timestamptz,
  experience_id uuid,
  is_verified boolean,
  has_whatsapp boolean,
  is_emergency_24h boolean,
  has_workshop boolean,
  workshop_name text,
  workshop_address text,
  working_hours jsonb,
  description text,
  services text[],
  categories jsonb,
  areas jsonb,
  experience_options jsonb,
  average_rating numeric,
  review_count int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH safe_params AS (
    SELECT
      public.normalize_ar(left(trim(coalesce(q, '')), 60)) AS norm_q,
      least(greatest(coalesce(p_limit, 20), 1), 100) AS safe_limit,
      greatest(coalesce(p_offset, 0), 0) AS safe_offset
  ),
  provider_ratings AS (
    SELECT
      r.provider_id,
      round(avg(r.rating)::numeric, 1) AS avg_rating,
      count(*)::int AS rev_count
    FROM public.reviews r
    WHERE r.status = 'approved'
    GROUP BY r.provider_id
  )
  SELECT
    p.id,
    p.name,
    p.category_id,
    p.area_id,
    p.photo_url,
    p.status,
    p.is_premium,
    p.premium_expires_at,
    p.experience_id,
    p.is_verified,
    p.has_whatsapp,
    p.is_emergency_24h,
    p.has_workshop,
    p.workshop_name,
    p.workshop_address,
    p.working_hours,
    p.description,
    p.services,
    CASE WHEN c.id IS NOT NULL THEN json_build_object('id', c.id, 'name', c.name) ELSE NULL END AS categories,
    CASE WHEN a.id IS NOT NULL THEN json_build_object('id', a.id, 'name', a.name) ELSE NULL END AS areas,
    CASE WHEN e.id IS NOT NULL THEN json_build_object('id', e.id, 'label', e.label) ELSE NULL END AS experience_options,
    coalesce(pr.avg_rating, 0) AS average_rating,
    coalesce(pr.rev_count, 0) AS review_count
  FROM public.providers p
  CROSS JOIN safe_params sp
  LEFT JOIN public.categories c ON c.id = p.category_id
  LEFT JOIN public.areas a ON a.id = p.area_id
  LEFT JOIN public.experience_options e ON e.id = p.experience_id
  LEFT JOIN provider_ratings pr ON pr.provider_id = p.id
  WHERE p.status = 'active'
    AND (p_category IS NULL OR p.category_id = p_category)
    AND (p_area IS NULL OR p.area_id = p_area)
    AND (NOT coalesce(p_emergency, false) OR p.is_emergency_24h = true)
    AND (
      sp.norm_q = ''
      OR public.normalize_ar(p.name) ILIKE '%' || sp.norm_q || '%'
      OR public.normalize_ar(coalesce(p.description, '')) ILIKE '%' || sp.norm_q || '%'
      OR public.normalize_ar(coalesce(c.name, '')) ILIKE '%' || sp.norm_q || '%'
      OR public.normalize_ar(coalesce(a.name, '')) ILIKE '%' || sp.norm_q || '%'
      OR EXISTS (
        SELECT 1
        FROM unnest(coalesce(p.services, ARRAY[]::text[])) srv
        WHERE public.normalize_ar(srv) ILIKE '%' || sp.norm_q || '%'
      )
    )
  ORDER BY
    (p.is_premium = true AND (p.premium_expires_at IS NULL OR p.premium_expires_at > now())) DESC,
    p.created_at DESC
  LIMIT (SELECT safe_limit FROM safe_params)
  OFFSET (SELECT safe_offset FROM safe_params);
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.normalize_ar(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_providers(text, uuid, uuid, boolean, boolean, int, int) TO anon, authenticated, service_role;


-- ==============================================================================
-- PROPOSED GIN INDEXES (pg_trgm) FOR HIGH CONCURRENCY / SPEED (Optional)
-- ==============================================================================
-- To enable super-fast fuzzy / substring searches across millions of rows,
-- you can enable pg_trgm extension and create GIN expression indexes:
--
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
--
-- CREATE INDEX IF NOT EXISTS idx_providers_name_norm_trgm
--   ON public.providers USING gin (public.normalize_ar(name) gin_trgm_ops);
--
-- CREATE INDEX IF NOT EXISTS idx_providers_description_norm_trgm
--   ON public.providers USING gin (public.normalize_ar(description) gin_trgm_ops)
--   WHERE description IS NOT NULL;
--
-- CREATE INDEX IF NOT EXISTS idx_categories_name_norm_trgm
--   ON public.categories USING gin (public.normalize_ar(name) gin_trgm_ops);
--
-- CREATE INDEX IF NOT EXISTS idx_areas_name_norm_trgm
--   ON public.areas USING gin (public.normalize_ar(name) gin_trgm_ops);
-- ==============================================================================
