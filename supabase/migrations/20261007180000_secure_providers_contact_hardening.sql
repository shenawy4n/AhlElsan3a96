-- ==============================================================================
-- Migration: Secure Providers Contact Hardening (Production & RLS Security)
-- File: supabase/migrations/20261007180000_secure_providers_contact_hardening.sql
-- 
-- Objectives:
-- 1. Prevent direct SELECT of sensitive contact information (phone, secondary_phone, whatsapp)
--    by anon and regular authenticated users.
-- 2. Grant column-level SELECT only on public provider directory columns.
-- 3. Maintain Contact Gateway (contact_provider RPC) for secure, tracked contact actions.
-- 4. Provide admin_get_providers() RPC for authorized administrators.
-- ==============================================================================

-- 1. Column level security: Revoke sensitive contact fields from anon and authenticated roles
REVOKE SELECT ON public.providers FROM anon, authenticated;

-- 2. Grant SELECT only on public, non-sensitive columns needed for directory browsing
GRANT SELECT (
  id,
  name,
  category_id,
  area_id,
  description,
  services,
  price_description,
  working_hours,
  photo_url,
  status,
  is_premium,
  premium_expires_at,
  created_at,
  updated_at,
  experience_id,
  is_verified,
  has_whatsapp,
  is_emergency_24h,
  has_workshop,
  workshop_name,
  workshop_address,
  working_hours_structured
) ON public.providers TO anon, authenticated;

-- 3. Ensure Contact Gateway RPC is SECURITY DEFINER with restricted search path
CREATE OR REPLACE FUNCTION public.contact_provider(_provider_id uuid, _kind text)
RETURNS TABLE (phone text, secondary_phone text, whatsapp text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _kind NOT IN ('phone_click', 'whatsapp_click', 'phone_reveal') THEN 
    RAISE EXCEPTION 'invalid_kind'; 
  END IF;

  -- Record contact analytics event for non-admin users
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_owner(auth.uid())) THEN
    INSERT INTO public.analytics_events (event_type, provider_id, category_id)
    SELECT _kind, p.id, p.category_id 
    FROM public.providers p 
    WHERE p.id = _provider_id AND p.status = 'active';
  END IF;

  -- Return the requested contact channel only
  RETURN QUERY SELECT
    CASE WHEN _kind <> 'whatsapp_click' THEN p.phone END,
    CASE WHEN _kind = 'phone_reveal' THEN p.secondary_phone END,
    CASE WHEN _kind = 'whatsapp_click' THEN p.whatsapp END
  FROM public.providers p 
  WHERE p.id = _provider_id AND p.status = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION public.contact_provider(uuid, text) TO anon, authenticated, service_role;

-- 4. Authorized Admin Provider Fetch RPC (Security Definer with RBAC check)
CREATE OR REPLACE FUNCTION public.admin_get_providers()
RETURNS SETOF public.providers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_owner(auth.uid())) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY SELECT * FROM public.providers ORDER BY created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_providers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_providers() TO authenticated, service_role;
