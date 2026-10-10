-- ====================================================================
-- أهل الصنعة (Ahl ElSan3a) - Complete Database Setup Script
-- Run this entire script in Supabase SQL Editor (New Project: ahuelbhmosyrozlaxbgb)
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS & TYPES
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. TABLES
-- Categories
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'Wrench',
  sort_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  unit_title text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Areas
CREATE TABLE IF NOT EXISTS public.areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Experience Options
CREATE TABLE IF NOT EXISTS public.experience_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Providers
CREATE TABLE IF NOT EXISTS public.providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  secondary_phone text,
  whatsapp text,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE RESTRICT,
  experience_id uuid REFERENCES public.experience_options(id) ON DELETE SET NULL,
  description text,
  services text[] DEFAULT '{}'::text[],
  price_description text,
  working_hours text,
  photo_url text,
  status text NOT NULL DEFAULT 'active',
  is_premium boolean NOT NULL DEFAULT false,
  premium_expires_at timestamptz,
  is_verified boolean NOT NULL DEFAULT false,
  is_emergency_24h boolean NOT NULL DEFAULT false,
  has_workshop boolean NOT NULL DEFAULT false,
  workshop_name text,
  workshop_address text,
  working_hours_structured jsonb DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add has_whatsapp virtual column if not exists
DO $$ BEGIN
  ALTER TABLE public.providers ADD COLUMN has_whatsapp boolean GENERATED ALWAYS AS (coalesce(btrim(whatsapp), '') <> '') STORED;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- Enforce normalized phone format on providers: 201XXXXXXXXX
ALTER TABLE public.providers
  DROP CONSTRAINT IF EXISTS providers_phone_check;
ALTER TABLE public.providers
  ADD CONSTRAINT providers_phone_check
  CHECK (phone ~ '^201[0125][0-9]{8}$');

ALTER TABLE public.providers
  DROP CONSTRAINT IF EXISTS providers_secondary_phone_check;
ALTER TABLE public.providers
  ADD CONSTRAINT providers_secondary_phone_check
  CHECK (secondary_phone IS NULL OR secondary_phone ~ '^201[0125][0-9]{8}$');

ALTER TABLE public.providers
  DROP CONSTRAINT IF EXISTS providers_whatsapp_check;
ALTER TABLE public.providers
  ADD CONSTRAINT providers_whatsapp_check
  CHECK (whatsapp IS NULL OR whatsapp ~ '^201[0125][0-9]{8}$');

-- Reviews
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text NOT NULL CHECK (char_length(btrim(comment)) >= 2 AND char_length(comment) <= 1000),
  reviewer_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text
);

-- Reports
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Service Suggestions
CREATE TABLE IF NOT EXISTS public.service_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  note text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Analytics Events
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  provider_id uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- App Settings
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Audit Log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid,
  admin_email text,
  action text NOT NULL,
  target text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Admin Users
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  is_owner boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  added_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_users_single_owner ON public.admin_users (is_owner) WHERE is_owner;

-- Rate Limit Policies
CREATE TABLE IF NOT EXISTS public.rate_limit_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_type text NOT NULL UNIQUE,
  max_requests int NOT NULL,
  window_seconds int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Rate Limit Events
CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  form_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_query ON public.rate_limit_events (form_type, ip, created_at DESC);

-- Provider Applications
CREATE TABLE IF NOT EXISTS public.provider_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  secondary_phone text,
  whatsapp text,
  category_id uuid NOT NULL REFERENCES public.categories(id),
  area_id uuid NOT NULL REFERENCES public.areas(id),
  experience_id uuid REFERENCES public.experience_options(id),
  description text,
  services text[] DEFAULT '{}'::text[],
  price_description text,
  working_hours text,
  photo_url text,
  is_emergency_24h boolean DEFAULT false,
  has_workshop boolean DEFAULT false,
  workshop_name text,
  workshop_address text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_applications_status ON public.provider_applications(status);

-- Enforce normalized phone format on provider_applications: 201XXXXXXXXX
ALTER TABLE public.provider_applications
  DROP CONSTRAINT IF EXISTS provider_applications_phone_check;
ALTER TABLE public.provider_applications
  ADD CONSTRAINT provider_applications_phone_check
  CHECK (phone ~ '^201[0125][0-9]{8}$');

ALTER TABLE public.provider_applications
  DROP CONSTRAINT IF EXISTS provider_applications_secondary_phone_check;
ALTER TABLE public.provider_applications
  ADD CONSTRAINT provider_applications_secondary_phone_check
  CHECK (secondary_phone IS NULL OR secondary_phone ~ '^201[0125][0-9]{8}$');

ALTER TABLE public.provider_applications
  DROP CONSTRAINT IF EXISTS provider_applications_whatsapp_check;
ALTER TABLE public.provider_applications
  ADD CONSTRAINT provider_applications_whatsapp_check
  CHECK (whatsapp IS NULL OR whatsapp ~ '^201[0125][0-9]{8}$');

-- ====================================================================
-- 4. FUNCTIONS & STORED PROCEDURES (RPCs)
-- ====================================================================

-- Check Owner
CREATE OR REPLACE FUNCTION public.is_owner(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users a 
    JOIN auth.users u ON lower(u.email) = a.email
    WHERE u.id = _user_id AND a.active AND a.is_owner
  );
$$;

-- Check Role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE 
    WHEN _role = 'admin' THEN
      EXISTS (
        SELECT 1 FROM public.admin_users a 
        JOIN auth.users u ON lower(u.email) = a.email
        WHERE u.id = _user_id AND a.active
      )
    ELSE false 
  END;
$$;

-- Admin Level
CREATE OR REPLACE FUNCTION public.my_admin_level() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE 
    WHEN public.is_owner(auth.uid()) THEN 'owner'
    WHEN public.has_role(auth.uid(), 'admin') THEN 'admin' 
    ELSE NULL 
  END;
$$;

-- Claim First Admin
CREATE OR REPLACE FUNCTION public.claim_first_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin');
$$;

-- Admin Management RPCs
CREATE OR REPLACE FUNCTION public.admin_add(_email text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  e text := lower(btrim(_email)); 
  new_id uuid; 
  me text;
BEGIN
  IF NOT public.is_owner(auth.uid()) THEN RAISE EXCEPTION 'not_owner'; END IF;
  IF e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(e) > 255 THEN RAISE EXCEPTION 'invalid_email'; END IF;
  IF EXISTS (SELECT 1 FROM public.admin_users WHERE email = e) THEN RAISE EXCEPTION 'already_admin'; END IF;
  SELECT email INTO me FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.admin_users (email, added_by_email) VALUES (e, me) RETURNING id INTO new_id;
  INSERT INTO public.audit_log (admin_id, admin_email, action, target) VALUES (auth.uid(), me, 'admin_added', e);
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_active(_id uuid, _active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  t text; 
  me text;
BEGIN
  IF NOT public.is_owner(auth.uid()) THEN RAISE EXCEPTION 'not_owner'; END IF;
  UPDATE public.admin_users SET active = _active WHERE id = _id AND NOT is_owner RETURNING email INTO t;
  IF t IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT email INTO me FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.audit_log (admin_id, admin_email, action, target)
  VALUES (auth.uid(), me, CASE WHEN _active THEN 'admin_reactivated' ELSE 'admin_deactivated' END, t);
END $$;

CREATE OR REPLACE FUNCTION public.admin_revoke(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  t text; 
  me text;
BEGIN
  IF NOT public.is_owner(auth.uid()) THEN RAISE EXCEPTION 'not_owner'; END IF;
  DELETE FROM public.admin_users WHERE id = _id AND NOT is_owner RETURNING email INTO t;
  IF t IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT email INTO me FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.audit_log (admin_id, admin_email, action, target) VALUES (auth.uid(), me, 'admin_access_revoked', t);
END $$;

-- Egyptian Phone Normalization (201XXXXXXXXX format)
CREATE OR REPLACE FUNCTION public.normalize_eg_phone(raw text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  digits text;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  digits := regexp_replace(raw, '[^0-9]', '', 'g');

  IF digits ~ '^00201[0125][0-9]{8}$' THEN
    digits := substr(digits, 3);
  END IF;

  IF digits ~ '^201[0125][0-9]{8}$' THEN
    RETURN digits;
  END IF;

  IF digits ~ '^01[0125][0-9]{8}$' THEN
    RETURN '2' || digits;
  END IF;

  IF digits ~ '^1[0125][0-9]{8}$' THEN
    RETURN '20' || digits;
  END IF;

  RETURN NULL;
END;
$$;

-- Secure Contact Provider RPC (Analytics + Masking)
CREATE OR REPLACE FUNCTION public.contact_provider(_provider_id uuid, _kind text)
RETURNS TABLE (phone text, whatsapp text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _kind NOT IN ('phone_click', 'whatsapp_click') THEN 
    RAISE EXCEPTION 'invalid_kind'; 
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator') OR public.is_owner(auth.uid())) THEN
    INSERT INTO public.analytics_events (event_type, provider_id, category_id)
    SELECT _kind, p.id, p.category_id FROM public.providers p WHERE p.id = _provider_id AND p.status = 'active';
  END IF;
  RETURN QUERY SELECT
    CASE WHEN _kind = 'phone_click' THEN p.phone ELSE NULL::text END AS phone,
    CASE WHEN _kind = 'whatsapp_click' THEN p.whatsapp ELSE NULL::text END AS whatsapp
  FROM public.providers p WHERE p.id = _provider_id AND p.status = 'active';
END $$;

-- Rate Limit Checker RPC
CREATE OR REPLACE FUNCTION public.check_rate_limit(ip text, form_type text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max int;
  v_window int;
  v_count int;
  v_lock_key bigint;
BEGIN
  v_lock_key := ('x' || substr(md5(ip || ':' || form_type), 1, 15))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT max_requests, window_seconds
  INTO v_max, v_window
  FROM public.rate_limit_policies
  WHERE rate_limit_policies.form_type = check_rate_limit.form_type;

  IF NOT FOUND THEN
    v_max := 5;
    v_window := 600;
  END IF;

  SELECT count(*)
  INTO v_count
  FROM public.rate_limit_events
  WHERE rate_limit_events.ip = check_rate_limit.ip
    AND rate_limit_events.form_type = check_rate_limit.form_type
    AND rate_limit_events.created_at > (now() - (v_window || ' seconds')::interval);

  IF v_count >= v_max THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_events (ip, form_type)
  VALUES (check_rate_limit.ip, check_rate_limit.form_type);

  RETURN true;
END;
$$;

-- Provider Application Approval RPC
CREATE OR REPLACE FUNCTION public.approve_application(app_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.provider_applications%ROWTYPE;
  v_norm_phone text;
  v_norm_sec text;
  v_norm_wa text;
  v_provider_id uuid;
  v_phone_hash_lock bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  SELECT * INTO v_app FROM public.provider_applications WHERE id = app_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;
  IF v_app.status != 'pending' THEN
    RAISE EXCEPTION 'Application is not pending (status: %)', v_app.status;
  END IF;

  v_norm_phone := public.normalize_eg_phone(v_app.phone);
  IF v_norm_phone IS NULL THEN
    RAISE EXCEPTION 'Primary phone is not a valid Egyptian mobile number: %', v_app.phone;
  END IF;
  v_norm_sec := public.normalize_eg_phone(v_app.secondary_phone);
  v_norm_wa := public.normalize_eg_phone(v_app.whatsapp);

  v_phone_hash_lock := ('x' || substr(md5(v_norm_phone), 1, 15))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_phone_hash_lock);

  IF EXISTS (
    SELECT 1 FROM public.providers
    WHERE status = 'active'
      AND (
        public.normalize_eg_phone(phone) = v_norm_phone
        OR (secondary_phone IS NOT NULL AND public.normalize_eg_phone(secondary_phone) = v_norm_phone)
      )
  ) THEN
    RAISE EXCEPTION 'A provider with this phone number is already active';
  END IF;

  INSERT INTO public.providers (
    name, phone, secondary_phone, whatsapp,
    category_id, area_id, experience_id,
    description, services, price_description, working_hours, photo_url,
    is_emergency_24h, has_workshop, workshop_name, workshop_address,
    status
  ) VALUES (
    v_app.name, v_norm_phone, v_norm_sec, v_norm_wa,
    v_app.category_id, v_app.area_id, v_app.experience_id,
    v_app.description, v_app.services, v_app.price_description, v_app.working_hours, v_app.photo_url,
    coalesce(v_app.is_emergency_24h, false), coalesce(v_app.has_workshop, false),
    v_app.workshop_name, v_app.workshop_address,
    'active'
  ) RETURNING id INTO v_provider_id;

  UPDATE public.provider_applications
  SET status = 'approved',
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      updated_at = now()
  WHERE id = app_id;

  RETURN json_build_object(
    'success', true,
    'provider_id', v_provider_id,
    'application_id', app_id
  );
END;
$$;

-- Provider Application Rejection RPC
CREATE OR REPLACE FUNCTION public.reject_application(app_id uuid, reason text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  IF reason IS NULL OR char_length(btrim(reason)) < 3 THEN
    RAISE EXCEPTION 'A valid rejection reason is required (at least 3 characters)';
  END IF;

  UPDATE public.provider_applications
  SET status = 'rejected',
      rejection_reason = btrim(reason),
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      updated_at = now()
  WHERE id = app_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found or not in pending status';
  END IF;

  RETURN json_build_object('success', true, 'application_id', app_id);
END;
$$;

-- Review Moderation RPCs
CREATE OR REPLACE FUNCTION public.approve_review(review_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE public.reviews SET status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()::text WHERE id = review_id;
  RETURN json_build_object('success', true, 'review_id', review_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_review(review_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE public.reviews SET status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()::text WHERE id = review_id;
  RETURN json_build_object('success', true, 'review_id', review_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_review(review_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  DELETE FROM public.reviews WHERE id = review_id;
  RETURN json_build_object('success', true, 'review_id', review_id);
END;
$$;

-- ====================================================================
-- 5. ROW LEVEL SECURITY (RLS) & GRANTS
-- ====================================================================

-- Enable RLS on all tables
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_applications ENABLE ROW LEVEL SECURITY;

-- Categories: public read, admin write
CREATE POLICY "public read categories" ON public.categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin manage categories" ON public.categories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Areas: public read, admin write
CREATE POLICY "public read areas" ON public.areas FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin manage areas" ON public.areas FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Experience Options: public read, admin write
CREATE POLICY "public read exp" ON public.experience_options FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin manage exp" ON public.experience_options FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Providers: public read (masked columns), admin all
CREATE POLICY "public read providers" ON public.providers FOR SELECT TO anon, authenticated USING (status = 'active');
CREATE POLICY "admin manage providers" ON public.providers FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Column level security for providers sensitive contact numbers (phone, secondary_phone, whatsapp)
-- Neither anon nor regular authenticated users can select sensitive contact columns directly.
REVOKE SELECT ON public.providers FROM anon, authenticated;
GRANT SELECT (
  id, name, category_id, area_id, description, services, price_description, 
  working_hours, photo_url, status, is_premium, premium_expires_at, 
  created_at, updated_at, experience_id, is_verified, has_whatsapp,
  is_emergency_24h, has_workshop, workshop_name, workshop_address, working_hours_structured
) ON public.providers TO anon, authenticated;

-- Admin-only provider reader (includes sensitive contact info, restricted to admin role or owner)
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

-- Reviews: public read approved, admin all
CREATE POLICY "public read approved reviews" ON public.reviews FOR SELECT TO anon, authenticated USING (status = 'approved');
CREATE POLICY "admin manage reviews" ON public.reviews FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Reports: admin read, insert via service_role / gateway
CREATE POLICY "admin read reports" ON public.reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update reports" ON public.reports FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Service Suggestions: admin read, insert via service_role / gateway
CREATE POLICY "admin read suggestions" ON public.service_suggestions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update suggestions" ON public.service_suggestions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Analytics: insert allowed for contact RPC, select for admin
CREATE POLICY "admin read analytics" ON public.analytics_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "system insert analytics" ON public.analytics_events FOR INSERT TO anon, authenticated WITH CHECK (true);

-- App Settings: public read, admin write
CREATE POLICY "public read settings" ON public.app_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin manage settings" ON public.app_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Audit Log: admin read
CREATE POLICY "admin read audit" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Admin Users: owner read/write
CREATE POLICY "owner reads admins" ON public.admin_users FOR SELECT TO authenticated USING (public.is_owner(auth.uid()));

-- Applications: admin read/write
CREATE POLICY "admin manage applications" ON public.provider_applications FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Rate limit tables: service role only
REVOKE ALL ON public.rate_limit_policies FROM anon, authenticated;
REVOKE ALL ON public.rate_limit_events FROM anon, authenticated;
GRANT ALL ON public.rate_limit_policies TO service_role;
GRANT ALL ON public.rate_limit_events TO service_role;

-- Grants for service role on all tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- Revoke anon insert from reports and suggestions (must pass through rate-limited gateway)
REVOKE INSERT ON public.reports FROM anon;
REVOKE INSERT ON public.service_suggestions FROM anon;

-- Grants for RPCs
GRANT EXECUTE ON FUNCTION public.contact_provider(uuid, text) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_add(text), public.admin_set_active(uuid, boolean), public.admin_revoke(uuid), public.my_admin_level() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add(text), public.admin_set_active(uuid, boolean), public.admin_revoke(uuid), public.my_admin_level() TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_application(uuid), public.reject_application(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_review(uuid), public.reject_review(uuid), public.delete_review(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text) TO service_role;

-- ====================================================================
-- 6. INITIAL SEED DATA
-- ====================================================================

-- Seed Rate Limit Policies
INSERT INTO public.rate_limit_policies (form_type, max_requests, window_seconds) VALUES
  ('report', 5, 600),
  ('service_suggestion', 5, 600),
  ('provider_application', 3, 600),
  ('review', 5, 600)
ON CONFLICT (form_type) DO NOTHING;

-- Seed Areas
INSERT INTO public.areas (id, name, status) VALUES
  ('dc01ff79-0490-44a0-8b9a-52574362edc7', 'ميت حبيب', 'active')
ON CONFLICT (id) DO NOTHING;

-- Seed Experience Options
INSERT INTO public.experience_options (id, label, sort_order, status) VALUES
  ('73e5c810-a96a-4d17-8a70-5284db1a6701', 'أقل من سنة', 1, 'active'),
  ('5a9db9d1-3f3c-4c0a-ac36-3a82f2f74e9e', '1 - 3 سنوات', 2, 'active'),
  ('d20a03ef-02c6-4967-b3ec-075ae9de9f3d', '4 - 7 سنوات', 3, 'active'),
  ('96f0e4d8-b953-4cf8-afc0-5be7e5e599c1', '8 - 10 سنوات', 4, 'active'),
  ('807b9948-698b-4ea6-850e-237d9ae83522', 'أكثر من 10 سنوات', 5, 'active')
ON CONFLICT (id) DO NOTHING;

-- Seed Categories
INSERT INTO public.categories (id, name, icon, sort_order, status) VALUES
  ('c4be9a69-5222-4788-8d96-3fada150c31c', 'كهربائي', 'Zap', 1, 'active'),
  ('c3f11fcd-dfb7-4e1c-b92a-bf091aec67dd', 'نجار', 'Hammer', 2, 'active'),
  ('4a9e5cb1-9211-4450-9847-d340219f0c02', 'سباك', 'Droplets', 3, 'active'),
  ('24140c52-eb1f-4aa4-8641-dafdebb1a6ed', 'نقاش', 'PaintRoller', 4, 'active'),
  ('b2ba8e58-0d61-4a30-b95d-50323d6f98fc', 'حداد', 'Wrench', 5, 'active'),
  ('7bb6b18f-7377-46ef-b20e-86e71bb9ef1c', 'فني اجهزة كهربائية', 'Plug', 6, 'active'),
  ('2b597fa7-42fd-47cc-9fa4-a4d010b5fea6', 'ميكانيكي', 'Car', 7, 'active'),
  ('5ecc9556-63e5-4ee7-bc28-46ce55389df0', 'سمكري سيارات', 'CarFront', 8, 'active'),
  ('d4e58417-a923-41b2-93e9-d27ec7c62b13', 'عامل بناء', 'Building2', 9, 'active'),
  ('22c31d30-4ad5-4758-bc56-7f38acfe2fb4', 'فني سيراميك', 'Grid3x3', 10, 'active'),
  ('c246fb7d-1f3d-416d-b0f7-ffcd97d84731', 'فني ألوميتال', 'Frame', 11, 'active'),
  ('0b1ff499-f1c8-492b-b24a-fe35b0a9cdd1', 'فني رخام', 'Layers', 12, 'active'),
  ('03e507cb-5c24-40d9-97eb-3be4af9691c8', 'مبيض محاره', 'Trowel', 13, 'active'),
  ('1710192b-d604-4ef8-bb86-982a477da1c2', 'فني دش و رسيفر', 'Satellite', 14, 'active'),
  ('b1c7819e-9382-4e48-aba7-d955d2cc757e', 'فني انظمة مراقبة', 'Satellite', 15, 'active'),
  ('7a4bd482-e960-438b-a1ad-58e661b871a6', 'ترزي', 'Scissors', 16, 'active'),
  ('a67f8e46-cae4-45fd-bb52-8296653a720d', 'نقل ومواصلات', 'Truck', 17, 'active'),
  ('5d5fc77a-98d9-4fe2-b921-42d2a0ce69cf', 'حلاق', 'Scissors', 18, 'active'),
  ('73267ce2-1540-4221-b09e-9c354a792a95', 'فني زجاج', 'Sparkles', 19, 'active'),
  ('b275f283-d4f1-4611-ac26-9275626f94fe', 'مصور', 'Camera', 20, 'active'),
  ('9b6fe4e1-a7ec-4b31-8625-ba67276922ab', 'دكتور', 'Stethoscope', 21, 'active'),
  ('f7d6f16b-279c-48c8-b1e0-7a5ebb608116', 'دروس', 'BookOpen', 22, 'active')
ON CONFLICT (id) DO NOTHING;

-- Seed Owner Admin (Your email)
INSERT INTO public.admin_users (email, is_owner, added_by_email) 
VALUES ('ahmedjeko96@gmail.com', true, 'system')
ON CONFLICT (email) DO NOTHING;

-- ====================================================================
-- 7. STORAGE POLICIES (provider-photos)
-- ====================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'provider-photos',
  'provider-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DO $$ BEGIN
  CREATE POLICY "Public Read Provider Photos" ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'provider-photos');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin Upload Provider Photos" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'provider-photos'
      AND public.has_role(auth.uid(), 'admin')
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin Delete Provider Photos" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'provider-photos'
      AND public.has_role(auth.uid(), 'admin')
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ====================================================================
-- 8. HOMEPAGE PERFORMANCE OPTIMIZATION
-- ====================================================================

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

GRANT EXECUTE ON FUNCTION public.get_homepage_data() TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_providers_status_category ON public.providers(status, category_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status_provider ON public.reviews(status, provider_id);

