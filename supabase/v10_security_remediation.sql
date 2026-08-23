-- ============================================================
-- AuthentiChain v10: Security Remediation (second-pass audit)
-- Closes the data-layer trust-boundary gaps found when the
-- documentation-level audit was verified against the real SQL:
--   1. products UPDATE was unrestricted for manufacturers
--      (fake "confirmed" anchors, silent un-recall, trust/claim resets)
--   2. Direct client writes to scan_logs could poison fraud counters
--   3. Over-broad reads (anon products/events, cross-manufacturer
--      alerts, all scan logs) enabled enumeration + reconnaissance
--   4. ownership_transfers direct INSERT bypassed custody validation
--      (and the old transfer RPC never set products.current_owner_id)
--   5. verify_product_secure trusted client GPS + had no rate limit +
--      deducted trust on every triggering scan (griefing amplifier)
--   6. record_blockchain_anchor accepted one-call fake "confirmed"
--   7. SECURITY DEFINER search_path deviation (Rules R2a) on v3 fns
--   8. admin_change_role could demote the last admin
--   9. user_roles allowed multiple roles per user (no UNIQUE(user_id))
--  10. Recall alert was inserted client-side (blocked by v3 RLS)
-- SAFE TO RE-RUN. Live-DB verification still required (see Tracker).
-- ============================================================

-- ┌─────────────────────────────────────────────────┐
-- │ 1. Rules R2a: pin search_path = '' on the        │
-- │    remaining SECURITY DEFINER functions          │
-- └─────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ┌─────────────────────────────────────────────────┐
-- │ 2. Exactly one role per user (dedupe + UNIQUE)   │
-- └─────────────────────────────────────────────────┘
-- Keep the highest-privilege role when duplicates exist
-- (admin > manufacturer > supplier > customer), tie-break on id.
DELETE FROM public.user_roles a
USING public.user_roles b
WHERE a.user_id = b.user_id
  AND a.id <> b.id
  AND (
    (CASE b.role WHEN 'admin' THEN 1 WHEN 'manufacturer' THEN 2 WHEN 'supplier' THEN 3 ELSE 4 END, b.id)
    <
    (CASE a.role WHEN 'admin' THEN 1 WHEN 'manufacturer' THEN 2 WHEN 'supplier' THEN 3 ELSE 4 END, a.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_id_key ON public.user_roles (user_id);

-- ┌─────────────────────────────────────────────────┐
-- │ 3. admin_change_role: self-demotion +            │
-- │    last-admin protection                         │
-- └─────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION public.admin_change_role(
  p_target_user_id UUID,
  p_new_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_count INT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can change user roles';
  END IF;

  IF p_new_role NOT IN ('manufacturer', 'supplier', 'customer', 'admin') THEN
    RAISE EXCEPTION 'Invalid role: %', p_new_role;
  END IF;

  IF p_target_user_id = auth.uid() AND p_new_role <> 'admin' THEN
    RAISE EXCEPTION 'Admins cannot change their own role — ask another admin';
  END IF;

  IF p_new_role <> 'admin' AND public.has_role(p_target_user_id, 'admin') THEN
    SELECT COUNT(*) INTO v_admin_count FROM public.user_roles WHERE role = 'admin';
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot demote the last remaining admin';
    END IF;
  END IF;

  UPDATE public.user_roles SET role = p_new_role WHERE user_id = p_target_user_id;
  IF NOT FOUND THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (p_target_user_id, p_new_role);
  END IF;

  RETURN jsonb_build_object('success', true, 'user_id', p_target_user_id, 'new_role', p_new_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_change_role(UUID, TEXT) TO authenticated;

-- ┌─────────────────────────────────────────────────┐
-- │ 4. products: close the direct-write bypass       │
-- │    (F2) + stop anon enumeration + hide           │
-- │    secure_token from client reads (F3)           │
-- └─────────────────────────────────────────────────┘
-- All protected state (status, trust, flags, claim, anchors) now
-- changes ONLY via SECURITY DEFINER RPCs:
--   record_supply_chain_event / record_blockchain_anchor /
--   resolve_fraud_alert / verify_product_secure.
-- The frontend has no legitimate direct UPDATE on products.

-- Drop the now-dead policies neutered by these REVOKEs (hygiene; idempotent)
DROP POLICY IF EXISTS "Public can verify products" ON public.products;
DROP POLICY IF EXISTS "Manufacturers can update own products" ON public.products;
REVOKE UPDATE ON public.products FROM authenticated, anon, public;
REVOKE SELECT ON public.products FROM anon, public;

GRANT SELECT (
  id, product_code, name, brand, category, description, origin_country,
  manufacture_date, expiry_date, batch_id, manufacturer_id, status,
  verification_hash, qr_data, is_flagged, flag_reason, metadata,
  created_at, updated_at, scan_status, is_claimed, claimed_by, claimed_at,
  current_owner_id, blockchain_tx, blockchain_tx_status, trust_score, image_url
) ON public.products TO authenticated;

-- ┌─────────────────────────────────────────────────┐
-- │ 5. supply_chain_events: RPC-only writes stay;    │
-- │    reads scoped to admin / actor / product       │
-- │    manufacturer / product custodian (F3)         │
-- └─────────────────────────────────────────────────┘
DROP POLICY IF EXISTS "Public can view events" ON public.supply_chain_events;
DROP POLICY IF EXISTS "Authenticated can view events" ON public.supply_chain_events;

CREATE POLICY "Scoped event visibility" ON public.supply_chain_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR actor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = supply_chain_events.product_id
        AND (p.manufacturer_id = auth.uid() OR p.current_owner_id = auth.uid())
    )
  );

-- ┌─────────────────────────────────────────────────┐
-- │ 6. scan_logs: close direct-write poisoning of    │
-- │    fraud counters; scope reads (audit finding)   │
-- └─────────────────────────────────────────────────┘
-- Scan rows are inserted ONLY by verify_product_secure (SECURITY
-- DEFINER). Direct REST inserts previously let anyone pre-charge a
-- product's clone/rapid counters against its next genuine scanner.
DROP POLICY IF EXISTS "Authenticated can view scan logs" ON public.scan_logs;
DROP POLICY IF EXISTS "Anyone can insert scan logs" ON public.scan_logs;
DROP POLICY IF EXISTS "Anon can insert scan logs" ON public.scan_logs;

CREATE POLICY "Scoped scan log visibility" ON public.scan_logs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR scanner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = scan_logs.product_id
        AND (p.manufacturer_id = auth.uid() OR p.current_owner_id = auth.uid())
    )
  );

-- ┌─────────────────────────────────────────────────┐
-- │ 7. fraud_alerts: scope reads to the product's    │
-- │    manufacturer (was: any manufacturer saw all); │
-- │    no client INSERT (RPCs insert as definer)     │
-- └─────────────────────────────────────────────────┘
DROP POLICY IF EXISTS "Admins and manufacturers can view fraud alerts" ON public.fraud_alerts;
DROP POLICY IF EXISTS "System can insert fraud alerts" ON public.fraud_alerts;
DROP POLICY IF EXISTS "Anon can insert fraud alerts" ON public.fraud_alerts;

CREATE POLICY "Scoped fraud alert visibility" ON public.fraud_alerts
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = fraud_alerts.product_id AND p.manufacturer_id = auth.uid()
    )
  );

-- ┌─────────────────────────────────────────────────┐
-- │ 8. resolve_fraud_alert: single admin RPC that    │
-- │    resolves + auto-unflags (FRD-08). Replaces    │
-- │    the client two-step whose products UPDATE     │
-- │    silently no-op'd under RLS.                   │
-- └─────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION public.resolve_fraud_alert(p_alert_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product_id UUID;
  v_remaining  INT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can resolve fraud alerts';
  END IF;

  UPDATE public.fraud_alerts
  SET is_resolved = true, resolved_by = auth.uid(), resolved_at = now()
  WHERE id = p_alert_id AND is_resolved = false
  RETURNING product_id INTO v_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alert not found or already resolved';
  END IF;

  SELECT COUNT(*) INTO v_remaining
  FROM public.fraud_alerts
  WHERE product_id = v_product_id AND is_resolved = false;

  IF v_remaining = 0 THEN
    UPDATE public.products
    SET is_flagged = false, flag_reason = NULL
    WHERE id = v_product_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'product_id', v_product_id,
    'unflagged', v_remaining = 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_fraud_alert(UUID) TO authenticated;

-- ┌─────────────────────────────────────────────────┐
-- │ 9. ownership_transfers: RPC-only writes (F6)     │
-- └─────────────────────────────────────────────────┘
DROP POLICY IF EXISTS "Authenticated users can insert transfers" ON public.ownership_transfers;
DROP POLICY IF EXISTS "Users can insert transfers" ON public.ownership_transfers;

-- ┌─────────────────────────────────────────────────┐
-- │ 10. transfer_product_ownership: rewrite          │
-- │   - custody-validated (COALESCE(owner, mfr))     │
-- │   - product locked FOR UPDATE (serializes        │
-- │     concurrent transfers)                        │
-- │   - active products only                         │
-- │   - server-computed transfer_hash                │
-- │   - SETS products.current_owner_id (was never    │
-- │     set anywhere — custody chain was dead)       │
-- │   - no more 'transferred' chain event (violated  │
-- │     the event_type CHECK and rolled back every   │
-- │     transfer); ownership is tracked in this      │
-- │     table + products.current_owner_id            │
-- └─────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION public.transfer_product_ownership(
  p_product_id UUID,
  p_to_email TEXT,
  p_transfer_type TEXT DEFAULT 'manufacturer_to_supplier',
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id     UUID := auth.uid();
  v_product       public.products%ROWTYPE;
  v_to_user       UUID;
  v_custodian     UUID;
  v_transfer_hash TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  -- Serialize concurrent transfers per product
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Product not found');
  END IF;

  IF v_product.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Product is not active (status: ' || v_product.status || ')');
  END IF;

  -- Custody: current accepted-transfer owner, falling back to manufacturer
  v_custodian := COALESCE(v_product.current_owner_id, v_product.manufacturer_id);
  IF v_caller_id <> v_custodian AND NOT public.has_role(v_caller_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: only the current custodian can transfer this product');
  END IF;

  SELECT au.id INTO v_to_user FROM auth.users au WHERE au.email = p_to_email;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No user found with email: ' || p_to_email);
  END IF;

  IF v_to_user = v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to yourself');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ownership_transfers
    WHERE product_id = p_product_id AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A pending transfer already exists for this product');
  END IF;

  v_transfer_hash := encode(
    sha256(convert_to(
      p_product_id::text || '|' || v_caller_id::text || '|' || v_to_user::text || '|' || now()::text,
      'UTF8'
    )),
    'hex'
  );

  INSERT INTO public.ownership_transfers (
    product_id, from_user_id, to_user_id, transfer_hash, status, notes, transfer_type
  ) VALUES (
    p_product_id, v_caller_id, v_to_user, v_transfer_hash, 'completed', p_notes, p_transfer_type
  );

  -- Custody actually moves (record_supply_chain_event reads this)
  UPDATE public.products SET current_owner_id = v_to_user WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'success', true,
    'transfer_hash', v_transfer_hash,
    'to_user_id', v_to_user,
    'message', 'Product transferred successfully'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_product_ownership(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ┌─────────────────────────────────────────────────┐
-- │ 11. record_supply_chain_event: recalled branch   │
-- │     now also records the manual_flag alert       │
-- │     (was client-side and silently blocked by     │
-- │     v3 RLS). Everything else unchanged from v7.  │
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
    sha256(convert_to(
      p_product_id::text || '|' || p_event_type || '|' || v_actor::text || '|' || v_now::text || '|' || COALESCE(v_prev_hash, 'genesis'),
      'UTF8'
    )),
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

  -- Recall flips product status AND records the alert in the same
  -- trusted transaction (single write path — no client-side inserts)
  IF p_event_type = 'recalled' THEN
    UPDATE public.products SET status = 'recalled' WHERE id = p_product_id;

    INSERT INTO public.fraud_alerts (product_id, alert_type, severity, description)
    VALUES (
      p_product_id,
      'manual_flag',
      'high',
      'Product ' || v_product.product_code || ' recalled by manufacturer'
    );
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
-- │ 12. record_blockchain_anchor: status-transition  │
-- │     rules — 'confirmed'/'failed' only for the    │
-- │     SAME hash previously recorded as 'pending';  │
-- │     a confirmed anchor is immutable. Blocks      │
-- │     one-call fake-proof injection. (Server-side  │
-- │     receipt verification = Edge Function,        │
-- │     tracked on the roadmap.)                     │
-- └─────────────────────────────────────────────────┘
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
  v_manufacturer    UUID;
  v_existing_tx     TEXT;
  v_existing_status TEXT;
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

  SELECT manufacturer_id, blockchain_tx, blockchain_tx_status
  INTO v_manufacturer, v_existing_tx, v_existing_status
  FROM public.products WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF v_manufacturer <> auth.uid() THEN
    RAISE EXCEPTION 'Only the product manufacturer can record a blockchain anchor';
  END IF;

  IF v_existing_status = 'confirmed' AND NOT (p_status = 'confirmed' AND v_existing_tx = p_tx_hash) THEN
    RAISE EXCEPTION 'This product already has a confirmed on-chain anchor';
  END IF;

  IF p_status IN ('confirmed', 'failed')
     AND (v_existing_status IS NULL OR v_existing_status = 'failed' OR v_existing_tx IS DISTINCT FROM p_tx_hash) THEN
    RAISE EXCEPTION 'A transaction can only be confirmed or failed after its hash was recorded as pending';
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
-- │ 13. verify_product_secure v10                    │
-- │   + GPS sanitation (NaN / out-of-range coords    │
-- │     are ignored — kills impossible-travel        │
-- │     griefing via fabricated coordinates)         │
-- │   + per-device rate limit (10 verifications/min  │
-- │     per server-computed fingerprint → RATE_LIMITED)
-- │   + clone rule counts DISTINCT devices (same     │
-- │     device/user re-scans never false-flag;       │
-- │     anonymous popularity no longer trips on      │
-- │     repeat scanners)                             │
-- │   + trust deductions only fire when a NEW alert  │
-- │     is actually created (no per-call draining)   │
-- │   + GENUINE result now carries the product's     │
-- │     event timeline (public anon reads on         │
-- │     supply_chain_events are gone)                │
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
  v_recent_count   BIGINT;
  v_hash_valid     BOOLEAN := true;
  v_event          RECORD;
  v_events         JSONB;
  v_distance_km    DOUBLE PRECISION;
  v_time_diff_hrs  DOUBLE PRECISION;
  v_speed_kmh      DOUBLE PRECISION;
  v_trust          INTEGER;
  v_device_hash    TEXT;
  v_recalled_at    TIMESTAMPTZ;
  v_lat            DOUBLE PRECISION := p_lat;
  v_lng            DOUBLE PRECISION := p_lng;
  SCAN_LIMIT       CONSTANT INTEGER := 10;
  RAPID_WINDOW_MIN CONSTANT INTEGER := 5;
  RAPID_LIMIT      CONSTANT INTEGER := 5;
  RATE_LIMIT       CONSTANT INTEGER := 10;  -- verifications per minute per device
BEGIN
  -- ── Input sanitation: fabricated / malformed GPS is ignored, not trusted ──
  IF v_lat IS NOT NULL AND (v_lat <> v_lat OR v_lat < -90 OR v_lat > 90) THEN
    v_lat := NULL;
  END IF;
  IF v_lng IS NOT NULL AND (v_lng <> v_lng OR v_lng < -180 OR v_lng > 180) THEN
    v_lng := NULL;
  END IF;

  -- Server-computed scanner fingerprint (hashed IP + uid + UA).
  -- Never trusted from the client. (Schema §2.6 / ImplementationPlan 1.2)
  v_device_hash := encode(
    sha256(convert_to(
      COALESCE(inet_client_addr()::text, 'local') || '|' ||
      COALESCE(auth.uid()::text, 'anon') || '|' ||
      COALESCE(p_user_agent, ''),
      'UTF8'
    )),
    'hex'
  );

  -- ── STEP 0a: Per-device rate limit (real enforcement, in-RPC) ──
  SELECT COUNT(*) INTO v_recent_count
  FROM public.scan_logs
  WHERE device_hash = v_device_hash
    AND created_at > now() - INTERVAL '1 minute';

  IF v_recent_count >= RATE_LIMIT THEN
    RETURN jsonb_build_object(
      'valid', false,
      'type', 'RATE_LIMITED',
      'message', 'Too many verification attempts from this device. Please wait a minute and try again.'
    );
  END IF;

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

  -- ── STEP 0b: Status check FIRST — a recalled/expired/suspended
  --    product must never report GENUINE (Schema §3.1 step 0) ──
  IF v_product.status IN ('recalled', 'expired', 'suspended') THEN
    SELECT created_at INTO v_recalled_at
    FROM public.supply_chain_events
    WHERE product_id = v_product.id AND event_type = 'recalled'
    ORDER BY created_at DESC LIMIT 1;

    -- Still log the scan attempt for audit (no trust changes)
    INSERT INTO public.scan_logs (product_id, scanner_id, user_agent, latitude, longitude, device_hash, is_suspicious, suspicion_reason)
    VALUES (v_product.id, auth.uid(), p_user_agent, v_lat, v_lng, v_device_hash, false, NULL);

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

  -- ── STEP 2: Clone detection — DISTINCT devices, not raw scan count.
  --    Same device/user re-scans are normal and never trip the rule;
  --    10+ distinct devices on one physical unit is the clone signal.
  SELECT COUNT(DISTINCT device_hash) INTO v_legit_count
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
      VALUES (v_product.id, auth.uid(), p_user_agent, v_lat, v_lng, v_device_hash, true, 'Excessive distinct-device scan count — possible cloned product');

      -- Alert + trust deduction only when a NEW alert is actually created
      IF NOT EXISTS (
        SELECT 1 FROM public.fraud_alerts
        WHERE product_id = v_product.id
          AND alert_type = 'cloned_product'
          AND created_at > now() - INTERVAL '1 hour'
      ) THEN
        INSERT INTO public.fraud_alerts (product_id, alert_type, severity, description)
        VALUES (
          v_product.id, 'cloned_product', 'critical',
          'Scan count (' || v_legit_count || ' distinct devices) exceeds limit (' || SCAN_LIMIT || '). Possible counterfeit product in circulation.'
        );

        -- Suspected — pending review (no instant permanent hard verdict without
        -- a corroborating signal; trust deduction is mild, flag is reviewable)
        UPDATE public.products
        SET trust_score = GREATEST(0, COALESCE(trust_score, 100) - 10),
            is_flagged = true,
            flag_reason = 'Suspected clone — pending review',
            scan_status = 'suspicious'
        WHERE id = v_product.id;
      END IF;

      RETURN jsonb_build_object(
        'valid', false, 'type', 'CLONE',
        'message', 'This product has been scanned by an unusually high number of devices (' || v_legit_count || '). You may be holding a counterfeit product.',
        'scan_count', v_legit_count,
        'first_scanned_at', v_last_scan.created_at,
        'product', jsonb_build_object(
          'id', v_product.id, 'name', v_product.name, 'brand', v_product.brand,
          'product_code', v_product.product_code
        )
      );
    END IF;
  END IF;

  -- ── STEP 2b: Rapid scan check (distinct devices in window) ──
  SELECT COUNT(DISTINCT device_hash) INTO v_legit_count
  FROM public.scan_logs
  WHERE product_id = v_product.id
    AND created_at > now() - (RAPID_WINDOW_MIN || ' minutes')::INTERVAL;

  IF v_legit_count >= RAPID_LIMIT THEN
    INSERT INTO public.scan_logs (product_id, scanner_id, user_agent, latitude, longitude, device_hash, is_suspicious, suspicion_reason)
    VALUES (v_product.id, auth.uid(), p_user_agent, v_lat, v_lng, v_device_hash, true, 'Rapid scanning detected');

    IF NOT EXISTS (
      SELECT 1 FROM public.fraud_alerts
      WHERE product_id = v_product.id
        AND alert_type IN ('rapid_scans', 'rapid_scan')
        AND created_at > now() - INTERVAL '30 minutes'
    ) THEN
      INSERT INTO public.fraud_alerts (product_id, alert_type, severity, description)
      VALUES (v_product.id, 'rapid_scans', 'medium',
        'Product scanned by ' || v_legit_count || ' distinct devices within ' || RAPID_WINDOW_MIN || ' minutes.');

      UPDATE public.products
      SET trust_score = GREATEST(0, COALESCE(trust_score, 100) - 10)
      WHERE id = v_product.id;
    END IF;
  END IF;

  -- ── STEP 3: Geo-fraud check (impossible travel > 500 km/h) ──
  IF v_lat IS NOT NULL AND v_lng IS NOT NULL THEN
    SELECT latitude, longitude, created_at INTO v_last_scan
    FROM public.scan_logs
    WHERE product_id = v_product.id
      AND latitude IS NOT NULL AND longitude IS NOT NULL
    ORDER BY created_at DESC LIMIT 1;

    IF FOUND AND v_last_scan.latitude IS NOT NULL THEN
      v_distance_km := 6371 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(v_lat - v_last_scan.latitude) / 2), 2) +
        COS(RADIANS(v_last_scan.latitude)) * COS(RADIANS(v_lat)) *
        POWER(SIN(RADIANS(v_lng - v_last_scan.longitude) / 2), 2)
      ));

      v_time_diff_hrs := EXTRACT(EPOCH FROM (now() - v_last_scan.created_at)) / 3600.0;
      v_speed_kmh := CASE WHEN v_time_diff_hrs > 0 THEN v_distance_km / v_time_diff_hrs ELSE 0 END;

      IF v_speed_kmh > 500 THEN
        -- Alert + trust deduction only when a NEW alert is actually created
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

          UPDATE public.products
          SET trust_score = GREATEST(0, COALESCE(trust_score, 100) - 20)
          WHERE id = v_product.id;
        END IF;
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
  VALUES (v_product.id, auth.uid(), p_user_agent, v_lat, v_lng, v_device_hash);

  UPDATE public.products
  SET is_claimed = true,
      scan_status = 'activated',
      trust_score = LEAST(100, COALESCE(trust_score, 100))
  WHERE id = v_product.id;

  SELECT COUNT(*) INTO v_scan_count
  FROM public.scan_logs
  WHERE product_id = v_product.id AND is_suspicious = false;

  SELECT trust_score INTO v_trust FROM public.products WHERE id = v_product.id;

  -- Journey timeline travels with the result (anon table reads removed)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id, 'event_type', e.event_type, 'location', e.location,
        'latitude', e.latitude, 'longitude', e.longitude, 'notes', e.notes,
        'actor_id', e.actor_id, 'previous_event_hash', e.previous_event_hash,
        'event_hash', e.event_hash, 'created_at', e.created_at
      ) ORDER BY e.created_at
    ), '[]'::jsonb
  )
  INTO v_events
  FROM public.supply_chain_events e
  WHERE e.product_id = v_product.id;

  RETURN jsonb_build_object(
    'valid', true, 'type', 'GENUINE',
    'message', 'Authentic product verified successfully.',
    'scan_count', v_scan_count,
    'trust_score', v_trust,
    'hash_chain_valid', v_hash_valid,
    'events', v_events,
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

-- ┌─────────────────────────────────────────────────┐
-- │ 14. Legacy surface reduction                      │
-- │  - log_product_scan: unused by the frontend,      │
-- │    body not in repo → revoke all access           │
-- │  - anchor_to_blockchain: mock, already dropped    │
-- │    in v7 → idempotent drop                        │
-- └─────────────────────────────────────────────────┘
DO $$
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.log_product_scan(UUID, TEXT) FROM anon, authenticated, public';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP FUNCTION IF EXISTS public.anchor_to_blockchain(UUID);

SELECT 'v10 applied' AS status;
