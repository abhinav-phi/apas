-- ============================================================
-- v4_clone_detection_fix.sql
-- Fix: Clone detection was too aggressive (1 scan = CLONE forever)
-- New logic: Allow up to SCAN_LIMIT legitimate scans per time window.
-- A product is only flagged as CLONE when scanned way beyond normal.
-- ============================================================

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
  v_product        RECORD;
  v_last_scan      RECORD;
  v_scan_count     BIGINT;
  v_legit_count    BIGINT;
  v_hash_valid     BOOLEAN := true;
  v_event          RECORD;
  v_distance_km    DOUBLE PRECISION;
  v_time_diff_hrs  DOUBLE PRECISION;
  v_speed_kmh      DOUBLE PRECISION;
  v_trust          INTEGER;
  -- Tunable limits
  SCAN_LIMIT       CONSTANT INTEGER := 10;   -- Max allowed unique scans before CLONE
  RAPID_WINDOW_MIN CONSTANT INTEGER := 5;    -- Minutes for rapid-scan fraud window
  RAPID_LIMIT      CONSTANT INTEGER := 5;    -- Max scans in that window = suspicious
BEGIN
  -- ─────────────────────────────────────────────
  -- STEP 1: Find product
  -- ─────────────────────────────────────────────
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

  -- ─────────────────────────────────────────────
  -- STEP 2: Improved clone detection
  -- Only flag as CLONE if scan count exceeds SCAN_LIMIT
  -- This allows real users to re-scan their own products.
  -- ─────────────────────────────────────────────
  SELECT COUNT(*) INTO v_legit_count
  FROM public.scan_logs
  WHERE product_id = v_product.id AND is_suspicious = false;

  IF v_legit_count >= SCAN_LIMIT THEN
    -- Fetch first scan info for the message
    SELECT created_at INTO v_last_scan
    FROM public.scan_logs
    WHERE product_id = v_product.id
    ORDER BY created_at ASC
    LIMIT 1;

    -- Log the suspicious scan
    INSERT INTO public.scan_logs (product_id, scanner_id, user_agent, is_suspicious, suspicion_reason, latitude, longitude)
    VALUES (v_product.id, auth.uid(), p_user_agent, true, 'Excessive scan count — possible cloned product', p_lat, p_lng);

    -- Only create an alert if one hasn't been created recently (avoid alert spam)
    IF NOT EXISTS (
      SELECT 1 FROM public.fraud_alerts
      WHERE product_id = v_product.id
        AND alert_type = 'cloned_product'
        AND created_at > now() - INTERVAL '1 hour'
    ) THEN
      INSERT INTO public.fraud_alerts (product_id, alert_type, severity, description)
      VALUES (
        v_product.id,
        'cloned_product',
        'critical',
        'Scan count (' || v_legit_count || ') exceeds limit (' || SCAN_LIMIT || '). Possible counterfeit product in circulation.'
      );
    END IF;

    UPDATE public.products
    SET trust_score = GREATEST(0, COALESCE(trust_score, 100) - 20),
        is_flagged = true,
        flag_reason = 'Excessive scan count — possible clone',
        scan_status = 'suspicious'
    WHERE id = v_product.id;

    RETURN jsonb_build_object(
      'valid', false,
      'type', 'CLONE',
      'message', 'This product has been scanned an unusually high number of times (' || v_legit_count || ' times). You may be holding a counterfeit product.',
      'scan_count', v_legit_count,
      'first_scanned_at', v_last_scan.created_at,
      'product', jsonb_build_object(
        'id', v_product.id,
        'name', v_product.name,
        'brand', v_product.brand,
        'product_code', v_product.product_code
      )
    );
  END IF;

  -- ─────────────────────────────────────────────
  -- STEP 2b: Rapid scan check (fraud within short window)
  -- ─────────────────────────────────────────────
  SELECT COUNT(*) INTO v_legit_count
  FROM public.scan_logs
  WHERE product_id = v_product.id
    AND created_at > now() - (RAPID_WINDOW_MIN || ' minutes')::INTERVAL;

  IF v_legit_count >= RAPID_LIMIT THEN
    -- Log as suspicious but still return GENUINE (let user verify)
    INSERT INTO public.scan_logs (product_id, scanner_id, user_agent, is_suspicious, suspicion_reason, latitude, longitude)
    VALUES (v_product.id, auth.uid(), p_user_agent, true, 'Rapid scanning detected', p_lat, p_lng);

    IF NOT EXISTS (
      SELECT 1 FROM public.fraud_alerts
      WHERE product_id = v_product.id
        AND alert_type = 'rapid_scan'
        AND created_at > now() - INTERVAL '30 minutes'
    ) THEN
      INSERT INTO public.fraud_alerts (product_id, alert_type, severity, description)
      VALUES (v_product.id, 'rapid_scan', 'medium',
        'Product scanned ' || v_legit_count || ' times within ' || RAPID_WINDOW_MIN || ' minutes.');
    END IF;

    UPDATE public.products
    SET trust_score = GREATEST(0, COALESCE(trust_score, 100) - 10)
    WHERE id = v_product.id;
  END IF;

  -- ─────────────────────────────────────────────
  -- STEP 3: Geo-fraud check (impossible travel)
  -- ─────────────────────────────────────────────
  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    SELECT latitude, longitude, created_at
    INTO v_last_scan
    FROM public.scan_logs
    WHERE product_id = v_product.id
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND AND v_last_scan.latitude IS NOT NULL THEN
      v_distance_km := 6371 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(p_lat - v_last_scan.latitude) / 2), 2) +
        COS(RADIANS(v_last_scan.latitude)) * COS(RADIANS(p_lat)) *
        POWER(SIN(RADIANS(p_lng - v_last_scan.longitude) / 2), 2)
      ));

      v_time_diff_hrs := EXTRACT(EPOCH FROM (now() - v_last_scan.created_at)) / 3600.0;

      IF v_time_diff_hrs > 0 THEN
        v_speed_kmh := v_distance_km / v_time_diff_hrs;
      ELSE
        v_speed_kmh := 0;
      END IF;

      IF v_speed_kmh > 500 THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.fraud_alerts
          WHERE product_id = v_product.id
            AND alert_type = 'impossible_travel'
            AND created_at > now() - INTERVAL '1 hour'
        ) THEN
          INSERT INTO public.fraud_alerts (product_id, alert_type, severity, description)
          VALUES (
            v_product.id,
            'impossible_travel',
            'high',
            'Scan detected ' || ROUND(v_distance_km::numeric, 1) || 'km away in ' ||
            ROUND(v_time_diff_hrs::numeric * 60, 1) || ' minutes (' || ROUND(v_speed_kmh::numeric, 0) || ' km/h).'
          );
        END IF;

        UPDATE public.products
        SET trust_score = GREATEST(0, COALESCE(trust_score, 100) - 20)
        WHERE id = v_product.id;
      END IF;
    END IF;
  END IF;

  -- ─────────────────────────────────────────────
  -- STEP 4: Hash chain integrity check
  -- ─────────────────────────────────────────────
  FOR v_event IN
    SELECT e.event_hash, e.previous_event_hash, e.created_at,
           LAG(e.event_hash) OVER (ORDER BY e.created_at) AS expected_prev
    FROM public.supply_chain_events e
    WHERE e.product_id = v_product.id
    ORDER BY e.created_at
  LOOP
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

  -- ─────────────────────────────────────────────
  -- STEP 5: SUCCESS — Record scan
  -- ─────────────────────────────────────────────
  INSERT INTO public.scan_logs (product_id, scanner_id, user_agent, latitude, longitude)
  VALUES (v_product.id, auth.uid(), p_user_agent, p_lat, p_lng);

  -- Update scan status (keep is_claimed for backward compat but don't use it for blocking)
  UPDATE public.products
  SET is_claimed = true,
      scan_status = 'activated',
      trust_score = LEAST(100, COALESCE(trust_score, 100))
  WHERE id = v_product.id;

  SELECT COUNT(*) INTO v_scan_count
  FROM public.scan_logs
  WHERE product_id = v_product.id AND is_suspicious = false;

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

GRANT EXECUTE ON FUNCTION public.verify_product_secure(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_product_secure(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO anon;

-- Also fix the column name mismatch: v2 used scan_lat/scan_lng, but schema has latitude/longitude
-- This ALTER is safe to run even if columns already exist
ALTER TABLE public.scan_logs ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.scan_logs ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Migrate any old data
UPDATE public.scan_logs SET latitude = scan_lat, longitude = scan_lng
WHERE scan_lat IS NOT NULL AND latitude IS NULL;
