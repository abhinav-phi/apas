-- ============================================================
-- Reconcile the LIVE remote database with the code's expectations.
--
-- Audit context: the live DB was built by hand in the dashboard and
-- drifted far behind the tracked v3–v14 remediation scripts. This
-- migration is ordered FIRST so the v* migrations that follow see the
-- schema they were written against.
--
-- Sections
--   1. products: add columns the RPCs and frontend rely on
--   2. ownership_transfers: add columns added by v5
--   3. scan_logs: add device_hash (v7)
--   4. fraud_alerts: drop the stale CHECK that only allows the legacy
--      alert vocabulary — verify_product_secure inserts
--      cloned_product / impossible_travel / tampered_chain and would
--      500 on every detection path under the old constraint
--   4b. supply_chain_events: widen event_type CHECK to include
--      'transferred' — transfer_product_ownership inserts it and the
--      legacy constraint rejects it (transfer RPC would 500)
--   4c. products.secure_token: live column is UUID, but v7/v10's RPCs
--      treat it as TEXT (32-hex SHA-256). Convert to TEXT (values are
--      preserved; RPC format checks require text semantics).
--   5. wallet linking tables (v9, with its own later migration)
--   6. profiles.is_verified: self-verification hardening
--      (audit P1: any user could PATCH their own is_verified=true
--       because the UPDATE policy is row-wide). UPDATE stays granted
--       for full_name/company_name/avatar_url only; is_verified can
--       then only change via SECURITY DEFINER paths.
-- SAFE TO RE-RUN. No destructive operations: no DROP COLUMN, no data
-- deletion (the two DELETEs are scoped + required, documented inline).
-- ============================================================

-- ┌─────────────────────────────────────────────────┐
-- │ 1. products: missing columns                     │
-- └─────────────────────────────────────────────────┘
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS current_owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS secure_token TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS trust_score INT NOT NULL DEFAULT 100;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_claimed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS claimed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS scan_status TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS blockchain_tx TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS blockchain_tx_status TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_blockchain_tx_status_check') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_blockchain_tx_status_check
      CHECK (blockchain_tx_status IS NULL OR blockchain_tx_status IN ('pending', 'confirmed', 'failed'));
  END IF;
END $$;

-- Custodian defaults to the manufacturer for every existing product.
UPDATE public.products SET current_owner_id = manufacturer_id WHERE current_owner_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_current_owner ON public.products (current_owner_id);

-- ┌─────────────────────────────────────────────────┐
-- │ 2. ownership_transfers: missing columns (v5)     │
-- └─────────────────────────────────────────────────┘
ALTER TABLE public.ownership_transfers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE public.ownership_transfers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.ownership_transfers ADD COLUMN IF NOT EXISTS transfer_type TEXT DEFAULT 'manufacturer_to_supplier';

-- ┌─────────────────────────────────────────────────┐
-- │ 3. scan_logs: device fingerprint column (v7)     │
-- └─────────────────────────────────────────────────┘
ALTER TABLE public.scan_logs ADD COLUMN IF NOT EXISTS device_hash TEXT;
ALTER TABLE public.scan_logs ADD COLUMN IF NOT EXISTS scan_lat DOUBLE PRECISION;
ALTER TABLE public.scan_logs ADD COLUMN IF NOT EXISTS scan_lng DOUBLE PRECISION;

-- ┌─────────────────────────────────────────────────┐
-- │ 4. fraud_alerts: widen/drop stale alert_type CHECK│
-- │    (audit P1: detection RPCs crashed on insert)  │
-- └─────────────────────────────────────────────────┘
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.fraud_alerts'::regclass
      AND contype = 'c'
      AND conname LIKE '%alert_type%'
  LOOP
    -- Only drop the legacy vocabulary constraint; keep a widened one.
    IF c.def LIKE '%duplicate_scan%' AND c.def NOT LIKE '%cloned_product%' THEN
      EXECUTE format('ALTER TABLE public.fraud_alerts DROP CONSTRAINT %I', c.conname);
      RAISE NOTICE 'dropped legacy constraint %', c.conname;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.fraud_alerts'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%cloned_product%'
  ) THEN
    ALTER TABLE public.fraud_alerts ADD CONSTRAINT fraud_alerts_alert_type_check
      CHECK (alert_type IN (
        'duplicate_scan', 'location_mismatch', 'invalid_sequence',
        'manual_flag', 'rapid_scans',
        'cloned_product', 'impossible_travel', 'tampered_chain'
      ));
    RAISE NOTICE 'added widened fraud_alerts_alert_type_check';
  END IF;
END $$;

-- ┌─────────────────────────────────────────────────┐
-- │ 4b. supply_chain_events: allow 'transferred'     │
-- └─────────────────────────────────────────────────┘
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.supply_chain_events'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%transferred%'
  ) THEN
    ALTER TABLE public.supply_chain_events DROP CONSTRAINT IF EXISTS supply_chain_events_event_type_check;
    ALTER TABLE public.supply_chain_events ADD CONSTRAINT supply_chain_events_event_type_check
      CHECK (event_type IN (
        'manufactured', 'shipped', 'in_transit', 'received',
        'delivered', 'sold', 'recalled', 'expired', 'transferred'
      ));
    RAISE NOTICE 'widened supply_chain_events_event_type_check';
  END IF;
END $$;

-- ┌─────────────────────────────────────────────────┐
-- │ 4c. products.secure_token: UUID → TEXT           │
-- │     (v7/v10 RPCs write 32-hex SHA-256 strings;   │
-- │      live column is UUID and would reject them)  │
-- └─────────────────────────────────────────────────┘
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products'
      AND column_name = 'secure_token' AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE public.products ALTER COLUMN secure_token DROP DEFAULT;
    ALTER TABLE public.products
      ALTER COLUMN secure_token TYPE TEXT USING secure_token::text;
    RAISE NOTICE 'converted products.secure_token uuid -> text';
  END IF;
END $$;

-- ┌─────────────────────────────────────────────────┐
-- │ 4d. user_roles.role: app_role enum → TEXT        │
-- │     (v3's "TEXT-role version" functions compare  │
-- │      role = TEXT; on a fresh rebuild the tracked  │
-- │      migration creates the column as the app_role │
-- │      enum and every has_role() call would fail)  │
-- └─────────────────────────────────────────────────┘
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_roles'
      AND column_name = 'role' AND udt_name = 'app_role'
  ) THEN
    ALTER TABLE public.user_roles
      ALTER COLUMN role TYPE TEXT USING role::text;
    DROP TYPE IF EXISTS public.app_role;
    RAISE NOTICE 'converted user_roles.role app_role -> text';
  END IF;
END $$;

-- ┌─────────────────────────────────────────────────┐
-- │ 5. wallet linking tables (v9 prerequisites)      │
-- │    (v09 migration later CREATEs them IF NOT      │
-- │     EXISTS too; created here so its DROP-then-   │
-- │     re-CREATE of the nonce FK always has a base) │
-- └─────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS public.wallet_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL UNIQUE CHECK (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  chain_id INT NOT NULL DEFAULT 11155111,
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  nonce TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_addresses_user ON public.wallet_addresses (user_id);
ALTER TABLE public.wallet_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_nonces ENABLE ROW LEVEL SECURITY;

-- ┌─────────────────────────────────────────────────┐
-- │ 6. profiles: is_verified can no longer be        │
-- │    self-granted (audit P1).                      │
-- │    6a. Trigger guard: reject direct self-grants  │
-- │        even if grants drift back open someday.   │
-- └─────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION public.forbid_self_verify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- SECURITY DEFINER RPCs/admin jobs run as the table owner (postgres /
  -- service_role); a client self-grant runs as the authenticated role.
  IF current_user IN ('authenticated', 'anon') AND NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    RAISE EXCEPTION 'is_verified can only be changed by an administrator';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forbid_self_verify_trg ON public.profiles;
CREATE TRIGGER forbid_self_verify_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.forbid_self_verify();

-- ┌─────────────────────────────────────────────────┐
-- │ 6b. Column-scoped grants: authenticated keeps    │
-- │     UPDATE only on user-editable columns.        │
-- │     (Grants are the primary defense; the trigger │
-- │     above is the belt-and-braces backstop.)      │
-- └─────────────────────────────────────────────────┘
REVOKE UPDATE ON TABLE public.profiles FROM authenticated, anon, public;
GRANT UPDATE (full_name, company_name, avatar_url) ON TABLE public.profiles TO authenticated;

SELECT 'reconcile applied' AS status;
