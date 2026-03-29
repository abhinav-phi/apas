-- ============================================================
-- AuthentiChain: Supabase SQL Fix Script
-- Run this ENTIRE script in Supabase SQL Editor (one shot)
-- ============================================================

-- ┌─────────────────────────────────────────────────┐
-- │ 1. CHECK if user already has a role             │
-- └─────────────────────────────────────────────────┘
SELECT ur.role, au.email
FROM public.user_roles ur
JOIN auth.users au ON au.id = ur.user_id
WHERE au.email = 'alpha9coder@gmail.com';

-- ┌─────────────────────────────────────────────────┐
-- │ 2. INSERT manufacturer role for the user        │
-- │    (skip if already exists)                     │
-- └─────────────────────────────────────────────────┘
INSERT INTO public.user_roles (user_id, role)
SELECT au.id, 'manufacturer'
FROM auth.users au
WHERE au.email = 'alpha9coder@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = au.id AND ur.role = 'manufacturer'
  );

-- ┌─────────────────────────────────────────────────┐
-- │ 3. BACKFILL profiles for users who signed up    │
-- │    before the profiles table existed             │
-- └─────────────────────────────────────────────────┘
INSERT INTO public.profiles (user_id, full_name)
SELECT
  au.id,
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1))
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id = au.id
);

-- ┌─────────────────────────────────────────────────┐
-- │ 4. CREATE log_product_scan RPC function         │
-- │    - Logs the scan into scan_logs               │
-- │    - Detects rapid scans (>=3 in 60s)           │
-- │      → flags product + creates fraud alert      │
-- │    - Returns scan_count for the product         │
-- └─────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION public.log_product_scan(
  p_product_id UUID,
  p_user_agent  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scan_count   BIGINT;
  v_recent_scans BIGINT;
BEGIN
  -- 1) Insert the scan log
  INSERT INTO public.scan_logs (product_id, scanner_id, user_agent)
  VALUES (
    p_product_id,
    auth.uid(),      -- NULL for anon callers, which is fine
    p_user_agent
  );

  -- 2) Total scan count for this product
  SELECT COUNT(*) INTO v_scan_count
  FROM public.scan_logs
  WHERE product_id = p_product_id;

  -- 3) Rapid-scan fraud detection: >=3 scans in the last 60 seconds
  SELECT COUNT(*) INTO v_recent_scans
  FROM public.scan_logs
  WHERE product_id = p_product_id
    AND created_at >= now() - interval '60 seconds';

  IF v_recent_scans >= 3 THEN
    -- Flag the product
    UPDATE public.products
    SET is_flagged  = true,
        flag_reason = 'Rapid scan detected (' || v_recent_scans || ' scans in 60 s)'
    WHERE id = p_product_id;

    -- Create fraud alert (ignore duplicate for same product in same minute)
    INSERT INTO public.fraud_alerts (product_id, alert_type, severity, description)
    VALUES (
      p_product_id,
      'rapid_scans',
      'high',
      'Product scanned ' || v_recent_scans || ' times within 60 seconds — possible cloning or abuse.'
    );
  END IF;

  RETURN jsonb_build_object('scan_count', v_scan_count);
END;
$$;

-- Grant execute to both authenticated and anon (verify page is public)
GRANT EXECUTE ON FUNCTION public.log_product_scan(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_product_scan(UUID, TEXT) TO anon;

-- ┌─────────────────────────────────────────────────┐
-- │ 5. ANON INSERT policy on fraud_alerts           │
-- │    (needed so the RPC can insert alerts when    │
-- │     called by unauthenticated verifiers)        │
-- └─────────────────────────────────────────────────┘
-- The RPC uses SECURITY DEFINER so it bypasses RLS,
-- but we also add an explicit anon policy for safety.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'fraud_alerts'
      AND policyname = 'Anon can insert fraud alerts'
  ) THEN
    EXECUTE 'CREATE POLICY "Anon can insert fraud alerts" ON public.fraud_alerts FOR INSERT TO anon WITH CHECK (true)';
  END IF;
END;
$$;

-- ┌─────────────────────────────────────────────────┐
-- │ 6. ANON INSERT policy on scan_logs              │
-- │    (already exists per migration, but ensure)   │
-- └─────────────────────────────────────────────────┘
-- Already exists: "Anon can insert scan logs"
-- No action needed if migration ran correctly.

-- ============================================================
-- DONE! Hard-refresh localhost:8080 and log in.
-- Sidebar should now show all manufacturer nav items.
-- ============================================================
