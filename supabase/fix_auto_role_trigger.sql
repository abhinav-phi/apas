-- ============================================================
-- PERMANENT FIX: Auto-create user_roles & profiles on sign-up
-- Run this ONCE in Supabase SQL Editor.
-- After this, you will NEVER need to manually insert roles again.
-- ============================================================

-- ┌─────────────────────────────────────────────────────────────┐
-- │ STEP 1: Clean up duplicate rows                            │
-- └─────────────────────────────────────────────────────────────┘
DELETE FROM public.user_roles
WHERE ctid NOT IN (
  SELECT MIN(ctid) FROM public.user_roles GROUP BY user_id
);

DELETE FROM public.profiles
WHERE ctid NOT IN (
  SELECT MIN(ctid) FROM public.profiles GROUP BY user_id
);

-- ┌─────────────────────────────────────────────────────────────┐
-- │ STEP 2: Create the trigger function                        │
-- │ Uses NOT EXISTS instead of ON CONFLICT (no constraint      │
-- │ needed). Fires on every new sign-up.                       │
-- └─────────────────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role TEXT;
  _full_name TEXT;
  _company_name TEXT;
BEGIN
  _role := COALESCE(NEW.raw_user_meta_data->>'app_role', 'customer');
  _full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  _company_name := NEW.raw_user_meta_data->>'company_name';

  -- Insert role only if not already present
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);
  END IF;

  -- Insert profile only if not already present
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = NEW.id) THEN
    INSERT INTO public.profiles (user_id, full_name, company_name)
    VALUES (NEW.id, _full_name, _company_name);
  END IF;

  RETURN NEW;
END;
$$;

-- ┌─────────────────────────────────────────────────────────────┐
-- │ STEP 3: Create the trigger on auth.users                   │
-- └─────────────────────────────────────────────────────────────┘
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ┌─────────────────────────────────────────────────────────────┐
-- │ STEP 4: BACKFILL all existing users missing roles          │
-- └─────────────────────────────────────────────────────────────┘
INSERT INTO public.user_roles (user_id, role)
SELECT
  au.id,
  COALESCE(au.raw_user_meta_data->>'app_role', 'customer')
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = au.id
);

-- ┌─────────────────────────────────────────────────────────────┐
-- │ STEP 5: BACKFILL all existing users missing profiles       │
-- └─────────────────────────────────────────────────────────────┘
INSERT INTO public.profiles (user_id, full_name, company_name)
SELECT
  au.id,
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)),
  au.raw_user_meta_data->>'company_name'
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id = au.id
);

-- ┌─────────────────────────────────────────────────────────────┐
-- │ STEP 6: Add UPDATE policy for user_roles (for upserts)     │
-- └─────────────────────────────────────────────────────────────┘
DROP POLICY IF EXISTS "Users can update own roles" ON public.user_roles;
CREATE POLICY "Users can update own roles" ON public.user_roles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ┌─────────────────────────────────────────────────────────────┐
-- │ STEP 7: Verify — show all users and their roles            │
-- └─────────────────────────────────────────────────────────────┘
SELECT au.email, ur.role, p.full_name, p.company_name
FROM auth.users au
LEFT JOIN public.user_roles ur ON ur.user_id = au.id
LEFT JOIN public.profiles p ON p.user_id = au.id
ORDER BY au.created_at DESC;

-- ============================================================
-- DONE! Every new signup will AUTOMATICALLY get their role
-- and profile. No more manual SQL needed!
-- ============================================================
--
-- ============================================================
-- OPTIONAL: Fix an existing user's role if it was backfilled
-- as 'customer' but should be something else:
--
-- UPDATE public.user_roles
-- SET role = 'supplier'
-- WHERE user_id = (
--   SELECT id FROM auth.users WHERE email = 'user@example.com'
-- );
-- ============================================================
