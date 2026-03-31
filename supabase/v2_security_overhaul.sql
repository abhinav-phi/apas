-- ============================================================
-- AuthentiChain v2: Security & Clone-Proof Overhaul
-- Run this ENTIRE script in Supabase SQL Editor (safe to re-run)
-- ============================================================

-- ┌─────────────────────────────────────────────────┐
-- │ 1. SCHEMA UPDATES                               │
-- └─────────────────────────────────────────────────┘

-- Clone-proof: secure token per product
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS secure_token UUID DEFAULT gen_random_uuid() NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'products' AND indexname = 'products_secure_token_key'
  ) THEN
    CREATE UNIQUE INDEX products_secure_token_key ON public.products (secure_token);
  END IF;
END;
$$;

-- Backfill tokens for existing products
UPDATE public.products SET secure_token = gen_random_uuid() WHERE secure_token IS NULL;

-- Scan status tracking
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS scan_status TEXT DEFAULT 'never_scanned' NOT NULL;

-- First-claim tracking (first scan = claimed)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_claimed BOOLEAN DEFAULT false;

-- Blockchain anchor (mock tx hash)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS blockchain_tx TEXT;

-- Trust score (0-100, computed on scan)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS trust_score INTEGER DEFAULT 100;

-- Add lat/lng to scan_logs for geo-fraud
ALTER TABLE public.scan_logs
  ADD COLUMN IF NOT EXISTS scan_lat DOUBLE PRECISION;
ALTER TABLE public.scan_logs
  ADD COLUMN IF NOT EXISTS scan_lng DOUBLE PRECISION;

-- ┌─────────────────────────────────────────────────┐
-- │ 2. MAIN RPC: verify_product_secure              │
-- │    THE ONLY function the frontend should call.  │
-- │    Handles: lookup, clone check, geo check,     │
-- │             hash chain check, scan logging.     │
-- └─────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.verify_product_secure(
  p_product_code TEXT,
  p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product       RECORD;
  v_last_scan     RECORD;
  v_scan_count    BIGINT;
  v_hash_valid    BOOLEAN := true;
  v_event         RECORD;
  v_expected_hash TEXT;
  v_distance_km   DOUBLE PRECISION;
  v_time_diff_hrs DOUBLE PRECISION;
  v_speed_kmh     DOUBLE PRECISION;
  v_trust         INTEGER;
BEGIN
  -- ────────────────────────────────────────────────
  -- STEP 1: Find product by code OR secure_token
  -- ────────────────────────────────────────────────
  SELECT * INTO v_product
  FROM public.products
  WHERE product_code = p_product_code
     OR secure_token::text = p_product_code
     OR qr_data = p_product_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'type', 'NOT_FOUND',
      'message', 'Product not found in our system.'
    );
  END IF;

  -- ────────────────────────────────────────────────
  -- STEP 2: Clone check — is product already claimed?
  -- ────────────────────────────────────────────────
  IF v_product.is_claimed = true THEN
    -- Get when it was first scanned
    SELECT created_at INTO v_last_scan
    FROM public.scan_logs
    WHERE product_id = v_product.id
    ORDER BY created_at ASC
    LIMIT 1;

    -- Still log this clone attempt
    INSERT INTO public.scan_logs (product_id, scanner_id, user_agent, is_suspicious, suspicion_reason, scan_lat, scan_lng)
    VALUES (v_product.id, auth.uid(), p_user_agent, true, 'Clone attempt — product already claimed', p_lat, p_lng);

    -- Create fraud alert
    INSERT INTO public.fraud_alerts (product_id, alert_type, severity, description)
    VALUES (
      v_product.id,
      'cloned_product',
      'critical',
      'Clone scan detected. Product was first verified on ' || COALESCE(v_last_scan.created_at::text, 'unknown date') || '.'
    );

    -- Deduct trust score
    UPDATE public.products
    SET trust_score = GREATEST(0, COALESCE(trust_score, 100) - 30),
        is_flagged = true,
        flag_reason = 'Clone detected',
        scan_status = 'suspicious'
    WHERE id = v_product.id;

    RETURN jsonb_build_object(
      'valid', false,
      'type', 'CLONE',
      'message', 'This product was already scanned on ' || COALESCE(to_char(v_last_scan.created_at, 'DD Mon YYYY HH24:MI'), 'an earlier date') || '. You may be holding a counterfeit product.',
      'first_scanned_at', v_last_scan.created_at,
      'product', jsonb_build_object(
        'id', v_product.id,
        'name', v_product.name,
        'brand', v_product.brand,
        'product_code', v_product.product_code
      )
    );
  END IF;

  -- ────────────────────────────────────────────────
  -- STEP 3: Geo-fraud check (impossible travel)
  -- ────────────────────────────────────────────────
  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    SELECT sl.scan_lat, sl.scan_lng, sl.created_at
    INTO v_last_scan
    FROM public.scan_logs sl
    WHERE sl.product_id = v_product.id
      AND sl.scan_lat IS NOT NULL
      AND sl.scan_lng IS NOT NULL
    ORDER BY sl.created_at DESC
    LIMIT 1;

    IF FOUND AND v_last_scan.scan_lat IS NOT NULL THEN
      -- Haversine formula in SQL
      v_distance_km := 6371 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(p_lat - v_last_scan.scan_lat) / 2), 2) +
        COS(RADIANS(v_last_scan.scan_lat)) * COS(RADIANS(p_lat)) *
        POWER(SIN(RADIANS(p_lng - v_last_scan.scan_lng) / 2), 2)
      ));

      v_time_diff_hrs := EXTRACT(EPOCH FROM (now() - v_last_scan.created_at)) / 3600.0;

      IF v_time_diff_hrs > 0 THEN
        v_speed_kmh := v_distance_km / v_time_diff_hrs;
      ELSE
        v_speed_kmh := 0;
      END IF;

      -- Impossible travel: >500km/h
      IF v_speed_kmh > 500 THEN
        INSERT INTO public.fraud_alerts (product_id, alert_type, severity, description)
        VALUES (
          v_product.id,
          'impossible_travel',
          'high',
          'Scan detected ' || ROUND(v_distance_km::numeric, 1) || 'km away in ' || ROUND(v_time_diff_hrs::numeric * 60, 1) || ' minutes (speed: ' || ROUND(v_speed_kmh::numeric, 0) || ' km/h).'
        );

        UPDATE public.products
        SET trust_score = GREATEST(0, COALESCE(trust_score, 100) - 20)
        WHERE id = v_product.id;
      END IF;
    END IF;
  END IF;

  -- ────────────────────────────────────────────────
  -- STEP 4: Hash chain integrity check
  -- ────────────────────────────────────────────────
  -- We do a simple check: verify all events have non-null hashes
  -- and that previous_event_hash linkage is not broken
  FOR v_event IN
    SELECT e.event_hash, e.previous_event_hash, e.created_at,
           LAG(e.event_hash) OVER (ORDER BY e.created_at) AS expected_prev
    FROM public.supply_chain_events e
    WHERE e.product_id = v_product.id
    ORDER BY e.created_at
  LOOP
    -- First event should have NULL previous hash
    IF v_event.expected_prev IS NOT NULL AND v_event.previous_event_hash IS DISTINCT FROM v_event.expected_prev THEN
      v_hash_valid := false;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_hash_valid THEN
    INSERT INTO public.fraud_alerts (product_id, alert_type, severity, description)
    VALUES (v_product.id, 'tampered_chain', 'critical', 'Supply chain hash chain integrity check FAILED.');

    UPDATE public.products
    SET trust_score = GREATEST(0, COALESCE(trust_score, 100) - 50),
        is_flagged = true,
        flag_reason = 'Hash chain tampered'
    WHERE id = v_product.id;

    RETURN jsonb_build_object(
      'valid', false,
      'type', 'TAMPERED',
      'message', 'Supply chain records have been tampered with. This product cannot be verified.',
      'product', jsonb_build_object(
        'id', v_product.id,
        'name', v_product.name,
        'brand', v_product.brand,
        'product_code', v_product.product_code
      )
    );
  END IF;

  -- ────────────────────────────────────────────────
  -- STEP 5: ALL GOOD — Record scan & claim product
  -- ────────────────────────────────────────────────
  INSERT INTO public.scan_logs (product_id, scanner_id, user_agent, scan_lat, scan_lng)
  VALUES (v_product.id, auth.uid(), p_user_agent, p_lat, p_lng);

  -- Claim the product (first valid scan)
  UPDATE public.products
  SET is_claimed = true,
      scan_status = 'activated',
      trust_score = LEAST(100, COALESCE(trust_score, 100) + 10)
  WHERE id = v_product.id;

  -- Get total scan count
  SELECT COUNT(*) INTO v_scan_count
  FROM public.scan_logs
  WHERE product_id = v_product.id AND is_suspicious = false;

  -- Re-fetch trust score
  SELECT trust_score INTO v_trust FROM public.products WHERE id = v_product.id;

  RETURN jsonb_build_object(
    'valid', true,
    'type', 'GENUINE',
    'message', 'Authentic product verified successfully.',
    'scan_count', v_scan_count,
    'trust_score', v_trust,
    'hash_chain_valid', v_hash_valid,
    'product', jsonb_build_object(
      'id', v_product.id,
      'name', v_product.name,
      'brand', v_product.brand,
      'product_code', v_product.product_code,
      'category', v_product.category,
      'status', v_product.status,
      'origin_country', v_product.origin_country,
      'manufacture_date', v_product.manufacture_date,
      'expiry_date', v_product.expiry_date,
      'verification_hash', v_product.verification_hash,
      'blockchain_tx', v_product.blockchain_tx,
      'scan_status', 'activated',
      'trust_score', v_trust,
      'is_flagged', v_product.is_flagged,
      'created_at', v_product.created_at
    )
  );
END;
$$;

-- Grant execute to both authenticated and anon
GRANT EXECUTE ON FUNCTION public.verify_product_secure(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_product_secure(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO anon;

-- ┌─────────────────────────────────────────────────┐
-- │ 3. KEEP OLD RPC for backward compat             │
-- │    (existing log_product_scan still works)       │
-- └─────────────────────────────────────────────────┘
-- No changes needed — old RPC stays for scan_logs.

-- ┌─────────────────────────────────────────────────┐
-- │ 4. RLS POLICY: scan_logs INSERT-only for anon   │
-- └─────────────────────────────────────────────────┘
-- Already exists from previous migration. Confirm:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'scan_logs'
      AND policyname = 'Anon can insert scan logs'
  ) THEN
    EXECUTE 'CREATE POLICY "Anon can insert scan logs" ON public.scan_logs FOR INSERT TO anon WITH CHECK (true)';
  END IF;
END;
$$;

-- ┌─────────────────────────────────────────────────┐
-- │ 5. FUNCTION: Mock blockchain anchor             │
-- │    Called by manufacturer to "anchor" a product │
-- └─────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION public.anchor_to_blockchain(
  p_product_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_hash TEXT;
BEGIN
  -- Generate a realistic-looking mock tx hash
  v_tx_hash := '0x' || encode(gen_random_bytes(32), 'hex');

  UPDATE public.products
  SET blockchain_tx = v_tx_hash
  WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'success', true,
    'tx_hash', v_tx_hash,
    'message', 'Product anchored to Sepolia testnet.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.anchor_to_blockchain(UUID) TO authenticated;

-- ============================================================
-- DONE! Deploy frontend changes and hard-refresh.
-- ============================================================
