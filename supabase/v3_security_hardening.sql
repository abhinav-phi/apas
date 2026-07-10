-- ============================================================
-- v3_security_hardening.sql
-- AuthentiChain Security Hardening
-- 
-- CRITICAL: Fixes RBAC privilege escalation vulnerability.
-- Previously any authenticated user could INSERT/UPDATE their own
-- role in user_roles, allowing self-assignment of admin/manufacturer.
--
-- Run this in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS / DROP IF EXISTS).
-- ============================================================

-- ─────────────────────────────────────────────
-- STEP 1: Drop insecure policies on user_roles
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can insert own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can update own roles" ON public.user_roles;
-- Also drop old select policy to replace with a better one
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

-- ─────────────────────────────────────────────
-- STEP 2: Add secure policies for user_roles
-- ─────────────────────────────────────────────

-- SELECT: users see their own role; admins can see all
CREATE POLICY "Users can view own roles or admins see all"
  ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- UPDATE: only admins can change roles
CREATE POLICY "Only admins can update roles"
  ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- DELETE: only admins can delete roles  
CREATE POLICY "Only admins can delete roles"
  ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- INSERT: NO direct insert policy.
-- Roles are ONLY created by the handle_new_user() SECURITY DEFINER trigger.
-- Admins can insert via the admin_change_role() RPC below.

-- ─────────────────────────────────────────────
-- STEP 3: Admin-only RPC to change user roles
-- This runs as SECURITY DEFINER so it bypasses RLS.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_change_role(
  p_target_user_id UUID,
  p_new_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_role_enum app_role;
BEGIN
  -- Only admins can call this
  IF NOT public.has_role(v_caller_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: admin only');
  END IF;

  -- Validate new role
  BEGIN
    v_role_enum := p_new_role::app_role;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid role: ' || p_new_role);
  END;

  -- Cannot demote the last admin
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_target_user_id AND role = 'admin'
  ) AND p_new_role != 'admin' THEN
    -- Check if this is the last admin
    IF (SELECT COUNT(*) FROM public.user_roles WHERE role = 'admin') <= 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cannot remove the last admin');
    END IF;
  END IF;

  -- Upsert the role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_target_user_id, v_role_enum)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Remove old roles for this user (they can only have one role at a time)
  DELETE FROM public.user_roles
  WHERE user_id = p_target_user_id AND role != v_role_enum;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'new_role', p_new_role
  );
END;
$$;

-- Grant execute to authenticated users (the function itself checks admin inside)
GRANT EXECUTE ON FUNCTION public.admin_change_role(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────
-- STEP 4: Also register admin_change_role in types
-- (for TypeScript — you'll need to update types.ts manually or via supabase gen)
-- ─────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- STEP 5: Also update the handle_new_user trigger
-- to include company_name in profile (if not already)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Read role from signup metadata
  v_role := NEW.raw_user_meta_data->>'app_role';
  
  -- Default to 'customer' if no role specified  
  IF v_role IS NULL OR v_role NOT IN ('manufacturer', 'supplier', 'customer', 'admin') THEN
    v_role := 'customer';
  END IF;

  -- Create profile
  INSERT INTO public.profiles (user_id, full_name, company_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'company_name'
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Create role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────
-- STEP 6: Verify the fix — run this to confirm:
-- SELECT rolname, polname, polcmd FROM pg_policies 
-- WHERE tablename = 'user_roles';
-- Result should NOT have any INSERT policy.
-- ─────────────────────────────────────────────
