-- ============================================================
-- AuthentiChain v3: CRITICAL Security Hardening (TEXT-role version)
-- Fixes: Role self-escalation vulnerability
-- SAFE TO RE-RUN.
-- ============================================================

-- 1. Remove dangerous self-service policies
DROP POLICY IF EXISTS "Users can insert own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can update own roles" ON public.user_roles;

-- 2. has_role() — TEXT-based, no enum casting needed
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 3. Signup trigger — safe defaults only, 'admin' never grantable at signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _requested_role TEXT;
  _final_role     TEXT;
  _full_name      TEXT;
  _company_name   TEXT;
BEGIN
  _requested_role := COALESCE(NEW.raw_user_meta_data->>'app_role', 'customer');

  IF _requested_role IN ('manufacturer', 'supplier', 'customer') THEN
    _final_role := _requested_role;
  ELSE
    _final_role := 'customer';
  END IF;

  _full_name    := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  _company_name := NEW.raw_user_meta_data->>'company_name';

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _final_role);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = NEW.id) THEN
    INSERT INTO public.profiles (user_id, full_name, company_name)
    VALUES (NEW.id, _full_name, _company_name);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. admin_change_role() — the ONLY legitimate way to change a role
CREATE OR REPLACE FUNCTION public.admin_change_role(
  p_target_user_id UUID,
  p_new_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can change user roles';
  END IF;

  IF p_new_role NOT IN ('manufacturer', 'supplier', 'customer', 'admin') THEN
    RAISE EXCEPTION 'Invalid role: %', p_new_role;
  END IF;

  UPDATE public.user_roles SET role = p_new_role WHERE user_id = p_target_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (p_target_user_id, p_new_role);
  END IF;

  RETURN jsonb_build_object('success', true, 'user_id', p_target_user_id, 'new_role', p_new_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_change_role(UUID, TEXT) TO authenticated;

-- 5. Verification/profile flag
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;

-- 6. Lock down fraud_alerts inserts
DROP POLICY IF EXISTS "System can insert fraud alerts" ON public.fraud_alerts;
DROP POLICY IF EXISTS "Anon can insert fraud alerts" ON public.fraud_alerts;

-- 7. AUDIT: check for any already-escalated accounts
SELECT au.email, ur.role, au.created_at
FROM public.user_roles ur
JOIN auth.users au ON au.id = ur.user_id
WHERE ur.role IN ('admin', 'manufacturer')
ORDER BY au.created_at DESC;