-- ==============================================================================
-- Migration: Eliminate phone_reveal and Harden Provider Contact Privacy
-- File: supabase/migrations/20261009153000_security_eliminate_phone_reveal_and_harden_privacy.sql
--
-- Objectives:
-- 1. Completely eliminate 'phone_reveal' contact action at database level.
-- 2. Strictly support only 'phone_click' and 'whatsapp_click'.
--    IF _kind NOT IN ('phone_click', 'whatsapp_click')
-- 3. Eliminate 'secondary_phone' from the public contact gateway return contract.
-- 4. Enforce minimum disclosure:
--    - phone_click returns ONLY primary phone (whatsapp is NULL).
--    - whatsapp_click returns ONLY whatsapp number (phone is NULL).
--    - Any unsupported action (including phone_reveal and NULL) is rejected with exception 'invalid_kind'.
-- 5. Enforce column-level SELECT restrictions on public.providers for anon and authenticated:
--    - Table-level SELECT revoked from PUBLIC, anon, and authenticated.
--    - Column-level SELECT explicitly granted ONLY on the 22 non-sensitive directory columns.
--    - Column-level SELECT on sensitive contact columns (phone, secondary_phone, whatsapp)
--      explicitly revoked to eliminate any surviving column grants.
-- 6. Eliminate direct RPC bypass:
--    - REVOKE EXECUTE on contact_provider from PUBLIC, anon, and authenticated.
--    - GRANT EXECUTE on contact_provider exclusively to service_role so that callers
--      cannot bypass server-side rate limiting or enumerate contact data via PostgREST.
-- 7. Configure explicit rate limit policy for provider_contact (10 requests / 10 minutes).
-- 8. Enforce strict, NULL-safe RBAC boundary on admin_get_providers():
--    - Only verified active administrators and owners can retrieve full provider data.
--    - Consistent with least-privilege policy (ordinary authenticated users and non-admin roles denied).
-- ==============================================================================

-- 1. Column-level privacy enforcement: revoke whole-table SELECT from public/anon/authenticated
REVOKE SELECT ON public.providers FROM PUBLIC, anon, authenticated;

-- 2. Grant SELECT only on explicitly approved non-sensitive public directory columns (22 columns)
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
  -- NULL, phone_reveal, and all unsupported actions are explicitly rejected.
  IF _kind IS NULL THEN
    RAISE EXCEPTION 'invalid_kind';
  END IF;

  IF _kind NOT IN ('phone_click', 'whatsapp_click') THEN
    RAISE EXCEPTION 'invalid_kind';
  END IF;

  -- Record contact analytics event for non-admin users only.
  -- NULL-safe evaluation: auth.uid() must be non-null and have verified admin/owner status to skip analytics.
  IF auth.uid() IS NULL OR NOT (
    coalesce(public.has_role(auth.uid(), 'admin'::public.app_role), false)
    OR coalesce(public.is_owner(auth.uid()), false)
  ) THEN
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

-- Eliminate Direct RPC Bypass:
-- Revoke execution from PUBLIC, anon, and authenticated so external callers cannot invoke
-- contact_provider via PostgREST to bypass rate limiting or enumerate contact data.
-- Grant EXECUTE exclusively to service_role so that only the trusted server-side gateway
-- (contactProviderServerFn) can execute this function.
REVOKE EXECUTE ON FUNCTION public.contact_provider(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contact_provider(uuid, text) TO service_role;

-- 5. Rate Limiting Policy for Provider Contact Gateway
-- Configures explicit rate limit of 10 contact requests per 10 minutes per IP
INSERT INTO public.rate_limit_policies (form_type, max_requests, window_seconds)
VALUES ('provider_contact', 10, 600)
ON CONFLICT (form_type) DO UPDATE
SET max_requests = EXCLUDED.max_requests,
    window_seconds = EXCLUDED.window_seconds;

-- 6. Secured Administrative Provider Fetch RPC with strict, NULL-safe authorization (Least Privilege)
CREATE OR REPLACE FUNCTION public.admin_get_providers()
RETURNS SETOF public.providers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reject unauthenticated callers immediately and ensure NULL results cannot bypass
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT (
    coalesce(public.has_role(auth.uid(), 'admin'::public.app_role), false)
    OR coalesce(public.is_owner(auth.uid()), false)
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY SELECT * FROM public.providers ORDER BY created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_providers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_providers() TO authenticated, service_role;
