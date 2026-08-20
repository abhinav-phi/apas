-- ============================================================
-- AuthentiChain v7: Server-Side Event Recording + Real Blockchain Anchoring
-- Implements: Schema.md §3.5 (record_supply_chain_event), TechSpec §4.2/§6.2
-- Requires: pgcrypto (enabled by default on Supabase)
-- SAFE TO RE-RUN.
-- ============================================================

-- ┌─────────────────────────────────────────────────┐
-- │ 1. SCHEMA UPDATES                               │
-- └─────────────────────────────────────────────────┘

-- TX status tracking (ImplementationPlan 4.1 — REQUIRED)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS blockchain_tx_status TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_blockchain_tx_status_check'
  ) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_blockchain_tx_status_check
      CHECK (blockchain_tx_status IS NULL OR blockchain_tx_status IN ('pending', 'confirmed', 'failed'));
  END IF;
END;
$$;

-- Server-computed scanner fingerprint (Schema §2.6 — never a client param)
ALTER TABLE public.scan_logs ADD COLUMN IF NOT EXISTS device_hash TEXT;

-- Purge legacy fake anchors (Rules R5 — no fake hashes posing as real ones)
UPDATE public.products
SET blockchain_tx = NULL, blockchain_tx_status = NULL
WHERE blockchain_tx IS NOT NULL AND blockchain_tx_status IS NULL;

-- ┌─────────────────────────────────────────────────┐
-- │ 2. SYSTEM ACTOR (used by v8 auto-expiry cron)    │
-- └─────────────────────────────────────────────────┘
-- Fixed UUID so SQL, cron jobs and docs all agree on the identity.
-- The auth.users row itself is created in v8_automation.sql.
CREATE OR REPLACE FUNCTION public.system_actor_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT '00000000-0000-0000-0000-000000000001'::uuid;
$$;

-- ┌─────────────────────────────────────────────────┐
-- │ 3. RLS: supply_chain_events is append-only RPC   │
-- │    writes only — drop client INSERT policy       │
-- └─────────────────────────────────────────────────┘
DROP POLICY IF EXISTS "Manufacturers and suppliers can insert events" ON public.supply_chain_events;
DROP POLICY IF EXISTS "Authenticated can insert events" ON public.supply_chain_events;
-- (No INSERT/UPDATE/DELETE policies remain: all writes go through
--  record_supply_chain_event() which runs as SECURITY DEFINER.)

-- ┌─────────────────────────────────────────────────┐
-- │ 4. record_supply_chain_event() RPC               │
-- │    Schema.md §3.5 — the ONLY write path for      │
-- │    supply chain events. Server-side hash chain,  │
-- │    state machine validation, custody check.      │
-- └─────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION public.record_supply_chain_event(
  p_product_id UUID,
  p_event_type TEXT,
  p_location TEXT DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product    RECORD;
  v_last       RECORD;
  v_prev_hash  TEXT;
  v_event_hash TEXT;
  v_new_id     UUID;
  v_created    TIMESTAMPTZ;
  v_actor      UUID := auth.uid();
  v_now        TIMESTAMPTZ := now();
  v_custodian  UUID;
  v_allowed    TEXT[];
BEGIN
  -- ── Auth ──────────────────────────────────────
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required to record supply chain events';
  END IF;

  IF p_event_type NOT IN ('manufactured','shipped','in_transit','received','delivered','sold','recalled','expired') THEN
    RAISE EXCEPTION 'Invalid event type: %', p_event_type;
  END IF;

  -- ── Load product, serialize concurrent writers per product ──
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  -- Last event (true previous hash source — client hashes are discarded)
  SELECT event_type, event_hash INTO v_last
  FROM public.supply_chain_events
  WHERE product_id = p_product_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;
  v_prev_hash := COALESCE(v_last.event_hash, NULL);

  -- ── Role / custody rules (AppFlow §2) ──────────
  IF p_event_type = 'manufactured' THEN
    IF v_last IS NOT NULL THEN
      RAISE EXCEPTION 'manufactured event already exists for this product';
    END IF;
    IF v_actor <> v_product.manufacturer_id THEN
      RAISE EXCEPTION 'Only the manufacturer can record the manufactured event';
    END IF;

  ELSIF p_event_type = 'recalled' THEN
    IF v_actor <> v_product.manufacturer_id THEN
      RAISE EXCEPTION 'Only the manufacturer can recall a product';
    END IF;

  ELSIF p_event_type = 'expired' THEN
    IF v_actor <> public.system_actor_id() THEN
      RAISE EXCEPTION 'expired events are recorded by the system only';
    END IF;

  ELSE
    -- shipped / in_transit / received / delivered / sold:
    -- actor must be the current custodian (accepted transfer target,
    -- falling back to the manufacturer before any transfer exists)
    SELECT COALESCE(v_product.current_owner_id, v_product.manufacturer_id)
    INTO v_custodian;

    IF v_actor <> v_custodian THEN
      RAISE EXCEPTION 'Custody check failed: only the current custodian can record % events', p_event_type;
    END IF;

    -- State machine (AppFlow §2 valid transitions)
    v_allowed := CASE v_last.event_type
      WHEN 'manufactured' THEN ARRAY['shipped']
      WHEN 'shipped'      THEN ARRAY['in_transit']
      WHEN 'in_transit'   THEN ARRAY['received']
      WHEN 'received'     THEN ARRAY['shipped', 'delivered', 'sold']
      WHEN 'delivered'    THEN ARRAY['sold']
      ELSE ARRAY[]::TEXT[]
    END;

    IF v_last.event_type = 'recalled' OR v_last.event_type = 'expired' OR v_last.event_type = 'sold' OR NOT (p_event_type = ANY(v_allowed)) THEN
      -- Invalid sequence: create fraud alert + flag product, REJECT the event.
      -- (Structured return instead of RAISE so the alert survives the transaction.)
      INSERT INTO public.fraud_alerts (product_id, alert_type, severity, description)
      VALUES (
        p_product_id,
        'invalid_sequence',
        'high',
        'Invalid event sequence rejected: ' || COALESCE(v_last.event_type, 'none') || ' → ' || p_event_type
          || ' for product ' || v_product.product_code
      );

      UPDATE public.products
      SET is_flagged = true,
          flag_reason = 'Invalid supply chain event sequence'
      WHERE id = p_product_id;

      RETURN jsonb_build_object(
        'success', false,
        'reason', 'invalid_sequence',
        'message', 'Invalid transition ' || COALESCE(v_last.event_type, 'none') || ' → ' || p_event_type
          || '. A high-severity fraud alert was recorded.'
      );
    END IF;
  END IF;

  -- ── Server-side hash: SHA-256(product_id | event_type | actor_id | timestamp | previous_hash) ──
  v_event_hash := encode(
    digest(
      p_product_id::text || '|' || p_event_type || '|' || v_actor::text || '|' || v_now::text || '|' || COALESCE(v_prev_hash, 'genesis'),
      'sha256'
    ),
    'hex'
  );

  INSERT INTO public.supply_chain_events (
    product_id, actor_id, event_type, location, latitude, longitude, notes,
    previous_event_hash, event_hash, created_at
  ) VALUES (
    p_product_id, v_actor, p_event_type, p_location, p_latitude, p_longitude, p_notes,
    v_prev_hash, v_event_hash, v_now
  )
  RETURNING id, created_at INTO v_new_id, v_created;

  -- Recall flips product status in the same transaction
  IF p_event_type = 'recalled' THEN
    UPDATE public.products SET status = 'recalled' WHERE id = p_product_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', v_new_id,
    'event_type', p_event_type,
    'event_hash', v_event_hash,
    'previous_event_hash', v_prev_hash,
    'created_at', v_created
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_supply_chain_event(UUID, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_supply_chain_event(UUID, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO authenticated;

-- ┌─────────────────────────────────────────────────┐
-- │ 5. Real blockchain anchor RPCs                   │
-- │    Replaces the FAKE anchor_to_blockchain mock.  │
-- └─────────────────────────────────────────────────┘
DROP FUNCTION IF EXISTS public.anchor_to_blockchain(UUID);

-- Frontend sends a REAL Sepolia tx hash after wallet signature.
-- Status lifecycle: pending → confirmed / failed (ImplementationPlan 4.1).
CREATE OR REPLACE FUNCTION public.record_blockchain_anchor(
  p_product_id UUID,
  p_tx_hash TEXT,
  p_status TEXT DEFAULT 'pending'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_manufacturer UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_tx_hash !~ '^0x[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION 'Invalid transaction hash format';
  END IF;

  IF COALESCE(p_status, 'pending') NOT IN ('pending', 'confirmed', 'failed') THEN
    RAISE EXCEPTION 'Invalid anchor status: %', p_status;
  END IF;

  SELECT manufacturer_id INTO v_manufacturer
  FROM public.products WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF v_manufacturer <> auth.uid() THEN
    RAISE EXCEPTION 'Only the product manufacturer can record a blockchain anchor';
  END IF;

  UPDATE public.products
  SET blockchain_tx = p_tx_hash,
      blockchain_tx_status = p_status
  WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'success', true,
    'tx_hash', p_tx_hash,
    'status', p_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_blockchain_anchor(UUID, TEXT, TEXT) TO authenticated;

-- ┌─────────────────────────────────────────────────┐
-- │ 6. verify_product_secure — status-first patch    │
-- │    Adds: STEP 0 status check, server-side        │
-- │    device_hash, ownership cross-check before     │
-- │    CLONE verdict, blockchain_tx_status in result │
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
SET search_path = ''
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
  v_device_hash    TEXT;
  v_recalled_at    TIMESTAMPTZ;
  SCAN_LIMIT       CONSTANT INTEGER := 10;
  RAPID_WINDOW_MIN CONSTANT INTEGER := 5;
  RAPID_LIMIT      CONSTANT INTEGER := 5;
BEGIN
  -- Server-computed scanner fingerprint (hashed IP + uid + UA).
  -- Never trusted from the client. (Schema §2.6 / ImplementationPlan 1.2)
  v_device_hash := encode(
    digest(
      COALESCE(inet_client_addr()::text, 'local') || '|' ||
      COALESCE(auth.uid()::text, 'anon') || '|' ||
      COALESCE(p_user_agent, ''),
      'sha256'
    ),
    'hex'
  );

  -- ── STEP 1: Find product by code OR secure_token OR qr_data ──
  SELECT * INTO v_product
  FROM public.products
  WHERE product_code = p_product_code
     OR secure_token::text = p_product_code
     OR qr_data = p_product_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false, 'type', 'NOT_FOUND',
      'message', 'Product not found in our system.'
    );
  END IF;

  -- ── STEP 0: Status check FIRST — a recalled/expired/suspended
  --    product must never report GENUINE (Schema §3.1 step 0) ──
  IF v_product.status IN ('recalled', 'expired', 'suspended') THEN
    SELECT created_at INTO v_recalled_at
    FROM public.supply_chain_events
    WHERE product_id = v_product.id AND event_type = 'recalled'
    ORDER BY created_at DESC LIMIT 1;

    -- Still log the scan attempt for audit (no trust changes)
    INSERT INTO public.scan_logs (product_id, scanner_id, user_agent, latitude, longitude, device_hash, is_suspicious, suspicion_reason)
    VALUES (v_product.id, auth.uid(), p_user_agent, p_lat, p_lng, v_device_hash, false, NULL);

    RETURN jsonb_build_object(
      'valid', false,
      'type', upper(v_product.status),
      'message', CASE v_product.status
        WHEN 'recalled'  THEN 'This product has been recalled by the manufacturer. Do not use.'
        WHEN 'expired'   THEN 'This product has passed its expiry date.'
        WHEN 'suspended' THEN 'This product is currently under review.'
      END,
      'recalled_at', v_recalled_at,
      'product', jsonb_build_object(
        'id', v_product.id, 'name', v_product.name, 'brand', v_product.brand,
        'product_code', v_product.product_code, 'category', v_product.category,
        'origin_country', v_product.origin_country,
        'manufacture_date', v_product.manufacture_date, 'expiry_date', v_product.expiry_date,
        'verification_hash', v_product.verification_hash,
        'blockchain_tx', v_product.blockchain_tx,
        'blockchain_tx_status', v_product.blockchain_tx_status,
        'created_at', v_product.created_at
      )
    );
  END IF;

  -- ── STEP 2: Clone detection (softened per ImplementationPlan 1.2) ──
  SELECT COUNT(*) INTO v_legit_count
  FROM public.scan_logs
  WHERE product_id = v_product.id AND is_suspicious = false;

  IF v_legit_count >= SCAN_LIMIT THEN
    -- Cross-check: an ACCEPTED ownership transfer means a legitimate new
    -- owner re-scanning must NOT be flagged as CLONE (ImplementationPlan 1.2.5)
    IF NOT EXISTS (
      SELECT 1 FROM public.ownership_transfers
      WHERE product_id = v_product.id
        AND status = 'accepted'
        AND to_user_id = auth.uid()
    ) THEN
      SELECT created_at INTO v_last_scan
      FROM public.scan_logs
      WHERE product_id = v_product.id
      ORDER BY created_at ASC LIMIT 1;

      INSERT INTO public.scan_logs (product_id, scanner_id, user_agent, latitude, longitude, device_hash, is_suspicious, suspicion_reason)
      VALUES (v_product.id, auth.uid(), p_user_agent, p_lat, p_lng, v_device_hash, true, 'Excessive scan count — possible cloned product');

      IF NOT EXISTS (
        SELECT 1 FROM public.fraud_alerts
        WHERE product_id = v_product.id
          AND alert_type = 'cloned_product'
          AND created_at > now() - INTERVAL '1 hour'
      ) THEN
        INSERT INTO public.fraud_alerts (product_id, alert_type, severity, description)
        VALUES (
          v_product.id, 'cloned_product', 'critical',
          'Scan count (' || v_legit_count || ') exceeds limit (' || SCAN_LIMIT || '). Possible counterfeit product in circulation.'
        );
      END IF;

      -- Suspected — pending review (no instant permanent hard verdict without
      -- a corroborating signal; trust deduction is mild, flag is reviewable)
      UPDATE public.products
      SET trust_score = GREATEST(0, COALESCE(trust_score, 100) - 10),
          is_flagged = true,
          flag_reason = 'Suspected clone — pending review',
          scan_status = 'suspicious'
      WHERE id = v_product.id;

      RETURN jsonb_build_object(
        'valid', false, 'type', 'CLONE',
        'message', 'This product has been scanned an unusually high number of times (' || v_legit_count || '). You may be holding a counterfeit product.',
        'scan_count', v_legit_count,
        'first_scanned_at', v_last_scan.created_at,
        'product', jsonb_build_object(
          'id', v_product.id, 'name', v_product.name, 'brand', v_product.brand,
          'product_code', v_product.product_code
        )
      );
    END IF;
  END IF;

  -- ── STEP 2b: Rapid scan check (device-aware) ──
  SELECT COUNT(DISTINCT device_hash) INTO v_legit_count
  FROM public.scan_logs
  WHERE product_id = v_product.id
    AND created_at > now() - (RAPID_WINDOW_MIN || ' minutes')::INTERVAL;

  IF v_legit_count >= RAPID_LIMIT THEN
    INSERT INTO public.scan_logs (product_id, scanner_id, user_agent, latitude, longitude, device_hash, is_suspicious, suspicion_reason)
    VALUES (v_product.id, auth.uid(), p_user_agent, p_lat, p_lng, v_device_hash, true, 'Rapid scanning detected');

    IF NOT EXISTS (
      SELECT 1 FROM public.fraud_alerts
      WHERE product_id = v_product.id
        AND alert_type IN ('rapid_scans', 'rapid_scan')
        AND created_at > now() - INTERVAL '30 minutes'
    ) THEN
      INSERT INTO public.fraud_alerts (product_id, alert_type, severity, description)
      VALUES (v_product.id, 'rapid_scans', 'medium',
        'Product scanned by ' || v_legit_count || ' distinct devices within ' || RAPID_WINDOW_MIN || ' minutes.');
    END IF;

    UPDATE public.products
    SET trust_score = GREATEST(0, COALESCE(trust_score, 100) - 10)
    WHERE id = v_product.id;
  END IF;

  -- ── STEP 3: Geo-fraud check (impossible travel > 500 km/h) ──
  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    SELECT latitude, longitude, created_at INTO v_last_scan
    FROM public.scan_logs
    WHERE product_id = v_product.id
      AND latitude IS NOT NULL AND longitude IS NOT NULL
    ORDER BY created_at DESC LIMIT 1;

    IF FOUND AND v_last_scan.latitude IS NOT NULL THEN
      v_distance_km := 6371 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(p_lat - v_last_scan.latitude) / 2), 2) +
        COS(RADIANS(v_last_scan.latitude)) * COS(RADIANS(p_lat)) *
        POWER(SIN(RADIANS(p_lng - v_last_scan.longitude) / 2), 2)
      ));

      v_time_diff_hrs := EXTRACT(EPOCH FROM (now() - v_last_scan.created_at)) / 3600.0;
      v_speed_kmh := CASE WHEN v_time_diff_hrs > 0 THEN v_distance_km / v_time_diff_hrs ELSE 0 END;

      IF v_speed_kmh > 500 THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.fraud_alerts
          WHERE product_id = v_product.id
            AND alert_type = 'impossible_travel'
            AND created_at > now() - INTERVAL '1 hour'
        ) THEN
          INSERT INTO public.fraud_alerts (product_id, alert_type, severity, description)
          VALUES (
            v_product.id, 'impossible_travel', 'high',
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

  -- ── STEP 4: Hash chain integrity ──
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
      'valid', false, 'type', 'TAMPERED',
      'message', 'Supply chain records have been tampered with. This product cannot be verified.',
      'product', jsonb_build_object(
        'id', v_product.id, 'name', v_product.name, 'brand', v_product.brand,
        'product_code', v_product.product_code
      )
    );
  END IF;

  -- ── STEP 5: SUCCESS — record scan (with device fingerprint) ──
  INSERT INTO public.scan_logs (product_id, scanner_id, user_agent, latitude, longitude, device_hash)
  VALUES (v_product.id, auth.uid(), p_user_agent, p_lat, p_lng, v_device_hash);

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
    'valid', true, 'type', 'GENUINE',
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
      'blockchain_tx_status', v_product.blockchain_tx_status,
      'image_url', v_product.image_url,
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

-- ── Verification queries ──
SELECT 'v7 applied' AS status;
