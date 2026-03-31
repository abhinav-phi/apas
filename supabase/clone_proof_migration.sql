-- ============================================================
-- CLONE-PROOF PRODUCT VERIFICATION MIGRATION
-- Run this ENTIRE script in Supabase SQL Editor (safe to re-run)
-- ============================================================

-- ┌─────────────────────────────────────────────────┐
-- │ 1. ADD secure_token UUID column to products     │
-- │    - Unguessable, auto-generated per product    │
-- │    - Replaces product_code in QR URLs           │
-- └─────────────────────────────────────────────────┘
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS secure_token UUID DEFAULT gen_random_uuid() NOT NULL;

-- Add unique index (IF NOT EXISTS for safety)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'products'
      AND indexname = 'products_secure_token_key'
  ) THEN
    CREATE UNIQUE INDEX products_secure_token_key ON public.products (secure_token);
  END IF;
END;
$$;

-- Backfill: ensure any existing rows that somehow got NULL get a token
UPDATE public.products
SET secure_token = gen_random_uuid()
WHERE secure_token IS NULL;

-- ┌─────────────────────────────────────────────────┐
-- │ 2. ADD scan_status column to products           │
-- │    Values: 'never_scanned' | 'activated' |      │
-- │            'suspicious'                          │
-- └─────────────────────────────────────────────────┘
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS scan_status TEXT DEFAULT 'never_scanned' NOT NULL;

-- ┌─────────────────────────────────────────────────┐
-- │ 3. REPLACE log_product_scan RPC                 │
-- │    Clone detection logic:                       │
-- │    - First scan → activated                     │
-- │    - 2nd scan within 30s → suspicious + alert   │
-- │    - Returns scan_count + scan_status           │
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
  v_scan_count    BIGINT;
  v_recent_scans  BIGINT;
  v_current_status TEXT;
  v_new_status    TEXT;
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

  -- 3) Get current scan_status
  SELECT scan_status INTO v_current_status
  FROM public.products
  WHERE id = p_product_id;

  v_new_status := v_current_status;

  -- 4) First scan ever → activate the product
  IF v_current_status = 'never_scanned' THEN
    v_new_status := 'activated';
    UPDATE public.products
    SET scan_status = 'activated'
    WHERE id = p_product_id;

  -- 5) Already activated → check for clone pattern
  ELSIF v_current_status = 'activated' THEN
    -- Count scans in the last 30 seconds
    SELECT COUNT(*) INTO v_recent_scans
    FROM public.scan_logs
    WHERE product_id = p_product_id
      AND created_at >= now() - interval '30 seconds';

    -- 2+ scans in 30s → suspicious (possible clone)
    IF v_recent_scans >= 2 THEN
      v_new_status := 'suspicious';

      -- Flag the product
      UPDATE public.products
      SET scan_status = 'suspicious',
          is_flagged  = true,
          flag_reason = 'Possible cloned product detected (rapid re-scan within 30s)'
      WHERE id = p_product_id;

      -- Create fraud alert
      INSERT INTO public.fraud_alerts (product_id, alert_type, severity, description)
      VALUES (
        p_product_id,
        'cloned_product',
        'critical',
        'Product scanned ' || v_recent_scans || ' times within 30 seconds — possible clone detected.'
      );
    END IF;
  END IF;
  -- If already 'suspicious', leave it — once flagged, stays flagged

  RETURN jsonb_build_object(
    'scan_count',  v_scan_count,
    'scan_status', v_new_status
  );
END;
$$;

-- Grant execute to both authenticated and anon (verify page is public)
GRANT EXECUTE ON FUNCTION public.log_product_scan(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_product_scan(UUID, TEXT) TO anon;

-- ============================================================
-- DONE! Now deploy frontend changes and hard-refresh.
-- New QR codes will use: /verify?token={secure_token}
-- Old QR codes (?code=) still work via backward compat.
-- ============================================================
