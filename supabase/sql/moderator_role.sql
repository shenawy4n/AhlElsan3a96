-- ====================================================================
-- Migration: Add Moderator Role (مشرف محتوى) & Role Management
-- ====================================================================

-- 1. Add 'moderator' to app_role enum if it exists as an enum
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    BEGIN
      ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'moderator';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- 2. Add role column to admin_users table if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'admin_users' 
      AND column_name = 'role'
  ) THEN
    ALTER TABLE public.admin_users 
    ADD COLUMN role text NOT NULL DEFAULT 'admin' 
    CHECK (role IN ('owner', 'admin', 'moderator'));
  END IF;
END $$;

-- 3. Set existing owner role
UPDATE public.admin_users SET role = 'owner' WHERE is_owner = true;

-- 4. Update has_role function to recognize admin and moderator roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users a 
    JOIN auth.users u ON lower(u.email) = a.email
    WHERE u.id = _user_id 
      AND a.active 
      AND (
        (_role = 'admin' AND (a.role IN ('admin', 'owner') OR a.is_owner)) OR
        (_role = 'moderator' AND (a.role IN ('moderator', 'admin', 'owner') OR a.is_owner))
      )
  )
$$;

-- 5. Update my_admin_level function to return current caller's exact role
CREATE OR REPLACE FUNCTION public.my_admin_level() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE 
    WHEN public.is_owner(auth.uid()) THEN 'owner'
    ELSE (
      SELECT COALESCE(a.role, CASE WHEN a.is_owner THEN 'owner' ELSE 'admin' END)
      FROM public.admin_users a
      JOIN auth.users u ON lower(u.email) = a.email
      WHERE u.id = auth.uid() AND a.active
      LIMIT 1
    )
  END;
$$;
