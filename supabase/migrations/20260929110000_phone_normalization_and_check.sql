-- Migration: Enforce 201XXXXXXXXX normalized phone format and CHECK constraints
-- Target format: 12 digits, matching regex ^201[0125][0-9]{8}$

-- 1. Update SQL phone normalizer function to return 201XXXXXXXXX
CREATE OR REPLACE FUNCTION public.normalize_eg_phone(raw text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  digits text;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  -- Keep only numeric digits
  digits := regexp_replace(raw, '[^0-9]', '', 'g');

  -- Strip leading 00 if starts with 00201...
  IF digits ~ '^00201[0125][0-9]{8}$' THEN
    digits := substr(digits, 3);
  END IF;

  -- 201XXXXXXXXX (12 digits)
  IF digits ~ '^201[0125][0-9]{8}$' THEN
    RETURN digits;
  END IF;

  -- 01XXXXXXXXX (11 digits) -> 201XXXXXXXXX
  IF digits ~ '^01[0125][0-9]{8}$' THEN
    RETURN '2' || digits;
  END IF;

  -- 1XXXXXXXXX (10 digits) -> 201XXXXXXXXX
  IF digits ~ '^1[0125][0-9]{8}$' THEN
    RETURN '20' || digits;
  END IF;

  RETURN NULL;
END;
$$;

-- 2. Clean existing records in providers and provider_applications (if any)
UPDATE public.providers
SET phone = public.normalize_eg_phone(phone),
    secondary_phone = public.normalize_eg_phone(secondary_phone),
    whatsapp = public.normalize_eg_phone(whatsapp)
WHERE phone IS NOT NULL;

UPDATE public.provider_applications
SET phone = public.normalize_eg_phone(phone),
    secondary_phone = public.normalize_eg_phone(secondary_phone),
    whatsapp = public.normalize_eg_phone(whatsapp)
WHERE phone IS NOT NULL;

-- 3. Add CHECK constraints on providers table
ALTER TABLE public.providers
  DROP CONSTRAINT IF EXISTS providers_phone_check,
  ADD CONSTRAINT providers_phone_check
  CHECK (phone ~ '^201[0125][0-9]{8}$');

ALTER TABLE public.providers
  DROP CONSTRAINT IF EXISTS providers_secondary_phone_check,
  ADD CONSTRAINT providers_secondary_phone_check
  CHECK (secondary_phone IS NULL OR secondary_phone ~ '^201[0125][0-9]{8}$');

ALTER TABLE public.providers
  DROP CONSTRAINT IF EXISTS providers_whatsapp_check,
  ADD CONSTRAINT providers_whatsapp_check
  CHECK (whatsapp IS NULL OR whatsapp ~ '^201[0125][0-9]{8}$');

-- 4. Add CHECK constraints on provider_applications table
ALTER TABLE public.provider_applications
  DROP CONSTRAINT IF EXISTS provider_applications_phone_check,
  ADD CONSTRAINT provider_applications_phone_check
  CHECK (phone ~ '^201[0125][0-9]{8}$');

ALTER TABLE public.provider_applications
  DROP CONSTRAINT IF EXISTS provider_applications_secondary_phone_check,
  ADD CONSTRAINT provider_applications_secondary_phone_check
  CHECK (secondary_phone IS NULL OR secondary_phone ~ '^201[0125][0-9]{8}$');

ALTER TABLE public.provider_applications
  DROP CONSTRAINT IF EXISTS provider_applications_whatsapp_check,
  ADD CONSTRAINT provider_applications_whatsapp_check
  CHECK (whatsapp IS NULL OR whatsapp ~ '^201[0125][0-9]{8}$');

-- 5. Update approve_application RPC with parameter _id
CREATE OR REPLACE FUNCTION public.approve_application(_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  a public.provider_applications%ROWTYPE; 
  ph text; 
  wa text; 
  sec text;
  new_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO a FROM public.provider_applications WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF a.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  
  ph := public.normalize_eg_phone(a.phone);
  IF ph IS NULL THEN RAISE EXCEPTION 'invalid_phone'; END IF;
  wa := public.normalize_eg_phone(a.whatsapp);
  sec := public.normalize_eg_phone(a.secondary_phone);

  INSERT INTO public.providers (
    name, category_id, area_id, phone, secondary_phone, whatsapp, description, services, status
  )
  VALUES (
    a.name, a.category_id, a.area_id, ph, sec, wa, a.description, a.services, 'active'
  )
  RETURNING id INTO new_id;

  UPDATE public.provider_applications 
  SET status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
  WHERE id = _id;

  RETURN new_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.approve_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_application(uuid) TO authenticated;
