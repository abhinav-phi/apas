-- ============================================================
-- Post-v10 hardening (audit findings P0/P1 closure)
--
--   1. link_wallet_address REVOKE (audit P0): the RPC validated the
--      nonce but never the ECDSA signature — anyone calling it
--      directly could bind any wallet. Now the verified path is the
--      `verify-wallet-link` Edge Function ONLY (service_role), which
--      performs real ecrecover. The client RPC keeps working for the
--      nonce lifecycle (request/purge) but linking goes through the
--      function.
--   2. unlink stays client-callable (self-service, harmless).
--   3. record_blockchain_anchor keeps its client grant but the
--      confirmed/failed transition is now only reachable by
--      service_role (the deployed verify-anchor-receipt Edge
--      Function); clients can only set 'pending' — anchor status is
--      server-attested, not manufacturer-asserted.
--   4. Automation RPCs (audit P2): refresh_daily_stats /
--      expire_products_daily were EXECUTE-granted to every
--      authenticated user — write amplification. Revoked; pg_cron
--      and service_role keep them.
--   5. verify_product_secure: v10's implementation had the CHECK-
--      widening fix already scoped (v_reconcile migration widens the
--      constraint); nothing further needed here.
-- SAFE TO RE-RUN (idempotent GRANT/REVOKE + CREATE OR REPLACE).
-- ============================================================

-- ┌─────────────────────────────────────────────────┐
-- │ 1. Wallet linking: client RPC → Edge Function only│
-- └─────────────────────────────────────────────────┘
REVOKE EXECUTE ON FUNCTION public.link_wallet_address(TEXT, TEXT, TEXT, INT) FROM authenticated, anon, public;

-- Service role (Edge Functions) must retain access.
GRANT EXECUTE ON FUNCTION public.link_wallet_address(TEXT, TEXT, TEXT, INT) TO service_role;

-- ┌─────────────────────────────────────────────────┐
-- │ 2. Anchor status: clients propose, server decides │
-- └─────────────────────────────────────────────────┘
-- Wrap the confirmed/failed transition behind a definer that only
-- the service role may invoke, and harden the client path to only
-- accept 'pending'.
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
  IF p_tx_hash !~ '^0x[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION 'Invalid transaction hash format';
  END IF;

  IF p_status NOT IN ('pending', 'confirmed', 'failed') THEN
    RAISE EXCEPTION 'Invalid anchor status';
  END IF;

  -- Clients may only propose a pending anchor. confirmed/failed is
  -- reserved for the verify-anchor-receipt Edge Function (service_role
  -- calls this definer via its elevated JWT).
  IF p_status IN ('confirmed', 'failed') AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'Anchor status transitions must be verified server-side';
  END IF;

  SELECT manufacturer_id, blockchain_tx, blockchain_tx_status
  INTO v_manufacturer, v_existing_tx, v_existing_status
  FROM public.products WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF v_manufacturer <> auth.uid() AND current_user <> 'service_role' THEN
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

REVOKE EXECUTE ON FUNCTION public.record_blockchain_anchor(UUID, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.record_blockchain_anchor(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ┌─────────────────────────────────────────────────┐
-- │ 3. Automation RPCs: cron/service only            │
-- └─────────────────────────────────────────────────┘
REVOKE EXECUTE ON FUNCTION public.refresh_daily_stats(INT) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.expire_products_daily() FROM authenticated, anon, public;

SELECT 'hardening applied' AS status;
