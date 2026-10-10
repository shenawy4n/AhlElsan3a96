-- ==============================================================================
-- Migration: Eliminate phone_reveal and Harden Provider Contact Privacy
-- File: supabase/migrations/20261009153000_security_eliminate_phone_reveal_and_harden_privacy.sql
--
-- Objectives:
-- 1. Completely eliminate 'phone_reveal' contact action at database level.
-- 2. Strictly support only 'phone_click' and 'whatsapp_click'.
-- 3. Eliminate 'secondary_phone' from the public contact gateway return contract.
-- 4. Enforce minimum disclosure:
--    - phone_click returns ONLY primary phone.
--    - whatsapp_click returns ONLY whatsapp number.
--    - Any unsupported action (including phone_reveal) is rejected with exception.
-- 5. Re-affirm and enforce column-level SELECT restrictions on public.providers.
-- 6. Enforce RBAC boundary on admin_get_providers() ensuring only verified
--    administrators, moderators, or owners can execute it.
-- ==============================================================================

-- 1. Column-level privacy enforcement: revoke whole-table SELECT from public/anon/authenticated
REVOKE SELECT ON public.providers FROM PUBLIC, anon, authenticated;

-- 2. Grant SELECT only on explicitly approved non-sensitive public directory columns
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

-- 3. Explicitly revoke sensitive contact columns from anon and authenticated
REVOKE SELECT (phone, secondary_phone, whatsapp) ON public.providers FROM PUBLIC, anon, authenticated;

-- 4. Replace Contact Gateway: completely remove phone_reveal and secondary_phone disclosure
DROP FUNCTION IF EXISTS public.contact_provider(uuid, text);

CREATE OR REPLACE FUNCTION public.contact_provider(_provider_id uuid, _kind text)
RETURNS TABLE (phone text, whatsapp text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Strictly allow only phone_click and whatsapp_click.
  -- phone_reveal and any other actions are explicitly forbidden.
  IF _kind NOT IN ('phone_click', 'whatsapp_click') THEN
    RAISE EXCEPTION 'invalid_kind';
  END IF;

  -- Record contact analytics event for non-admin users only
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator') OR public.is_owner(auth.uid())) THEN
    INSERT INTO public.analytics_events (event_type, provider_id, category_id)
    SELECT _kind, p.id, p.category_id
    FROM public.providers p
    WHERE p.id = _provider_id AND p.status = 'active';
  END IF;

  -- Minimum disclosure:
  -- - phone_click discloses only primary phone (whatsapp is NULL)
  -- - whatsapp_click discloses only whatsapp (phone is NULL)
  -- - secondary_phone is NEVER disclosed via public RPC
  RETURN QUERY SELECT
    CASE WHEN _kind = 'phone_click' THEN p.phone ELSE NULL::text END AS phone,
    CASE WHEN _kind = 'whatsapp_click' THEN p.whatsapp ELSE NULL::text END AS whatsapp
  FROM public.providers p
  WHERE p.id = _provider_id AND p.status = 'active';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.contact_provider(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contact_provider(uuid, text) TO anon, authenticated, service_role;

-- 5. Secured Administrative Provider Fetch RPC with strict authorization
CREATE OR REPLACE FUNCTION public.admin_get_providers()
RETURNS SETOF public.providers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator') OR public.is_owner(auth.uid())) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY SELECT * FROM public.providers ORDER BY created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_providers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_providers() TO authenticated, service_role;
