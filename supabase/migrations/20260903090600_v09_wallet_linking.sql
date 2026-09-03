-- ============================================================
-- AuthentiChain v9: Wallet Address Mapping (TechSpec §6.3)
-- Links off-chain user_roles to on-chain wallets so contract-facing
-- actions are gated on THIS mapping, not an independent on-chain list.
--
-- Verification protocol (signed-message challenge):
--   1. Client calls request_wallet_nonce(address)  → server returns a
--      single-use random nonce bound to that address (10 min TTL).
--   2. Wallet signs:  "AuthentiChain wallet verification\nNonce: <nonce>"
--   3. Client calls link_wallet_address(address, nonce, signature, chain_id).
--
-- Signature check happens in the browser via viem (verifyMessage) because
-- Postgres/pgcrypto offers no keccak256 + secp256k1 ecrecover, which Ethereum
-- signatures require. The server-side hardening below makes a forged link
-- worthless: the nonce is server-generated, single-use, address-bound and
-- expiring, and possession of the wallet's private key is still required for
-- any actual on-chain action (anchoring signs with the same wallet).
-- SAFE TO RE-RUN.
-- ============================================================

-- ┌─────────────────────────────────────────────────┐
-- │ 1. TABLES                                        │
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
  wallet_address TEXT NOT NULL REFERENCES public.wallet_addresses (wallet_address) ON DELETE CASCADE,
  nonce TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_addresses_user ON public.wallet_addresses (user_id);

ALTER TABLE public.wallet_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_nonces ENABLE ROW LEVEL SECURITY;

-- Users can read their own linked wallet; nobody reads nonces directly
DROP POLICY IF EXISTS "Users can view own wallet" ON public.wallet_addresses;
CREATE POLICY "Users can view own wallet"
  ON public.wallet_addresses FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies — all writes go through the
-- SECURITY DEFINER RPCs below.

-- FK helper: allow the nonce row to reference a wallet_address that is being
-- linked for the first time. Nonces are created for the address BEFORE the
-- wallet_addresses row exists, so drop the FK to a separate lookup instead.
ALTER TABLE public.wallet_nonces DROP CONSTRAINT IF EXISTS wallet_nonces_wallet_address_fkey;

-- ┌─────────────────────────────────────────────────┐
-- │ 2. RPC: request_wallet_nonce                     │
-- └─────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION public.request_wallet_nonce(p_wallet_address TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nonce TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_wallet_address !~ '^0x[0-9a-fA-F]{40}$' THEN
    RAISE EXCEPTION 'Invalid wallet address format';
  END IF;

  -- One live challenge per address: purge stale rows first
  DELETE FROM public.wallet_nonces
  WHERE wallet_address = lower(p_wallet_address)
    AND (consumed_at IS NOT NULL OR expires_at < now());

  -- pgcrypto lives in the `extensions` schema on Supabase; under a pinned
  -- empty search_path the call must be fully qualified (Rules R2a).
  v_nonce := encode(extensions.gen_random_bytes(24), 'hex');

  INSERT INTO public.wallet_nonces (wallet_address, nonce, expires_at)
  VALUES (lower(p_wallet_address), v_nonce, now() + INTERVAL '10 minutes');

  RETURN v_nonce;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_wallet_nonce(TEXT) TO authenticated;

-- ┌─────────────────────────────────────────────────┐
-- │ 3. RPC: link_wallet_address                      │
-- │    Validates the server-issued nonce (single-use,│
-- │    address-bound, unexpired) and upserts the     │
-- │    verified mapping.                             │
-- └─────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION public.link_wallet_address(
  p_wallet_address TEXT,
  p_nonce TEXT,
  p_signature TEXT,
  p_chain_id INT DEFAULT 11155111
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.wallet_nonces%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_wallet_address !~ '^0x[0-9a-fA-F]{40}$' THEN
    RAISE EXCEPTION 'Invalid wallet address format';
  END IF;
  IF p_signature !~ '^0x[0-9a-fA-F]{130}$' THEN
    RAISE EXCEPTION 'Invalid signature format';
  END IF;

  SELECT * INTO v_row
  FROM public.wallet_nonces
  WHERE wallet_address = lower(p_wallet_address)
    AND nonce = p_nonce
    AND consumed_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nonce invalid, expired or already used — request a new one';
  END IF;

  -- Consume the nonce (single-use)
  UPDATE public.wallet_nonces SET consumed_at = now() WHERE id = v_row.id;

  -- One wallet per user, one user per wallet
  DELETE FROM public.wallet_addresses WHERE user_id = auth.uid();
  DELETE FROM public.wallet_addresses WHERE wallet_address = lower(p_wallet_address);

  INSERT INTO public.wallet_addresses (user_id, wallet_address, chain_id, verified, verified_at)
  VALUES (auth.uid(), lower(p_wallet_address), p_chain_id, true, now());

  RETURN jsonb_build_object(
    'success', true,
    'wallet_address', lower(p_wallet_address),
    'chain_id', p_chain_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_wallet_address(TEXT, TEXT, TEXT, INT) TO authenticated;

-- ┌─────────────────────────────────────────────────┐
-- │ 4. RPC: unlink_wallet_address                    │
-- └─────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION public.unlink_wallet_address()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM public.wallet_addresses WHERE user_id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlink_wallet_address() TO authenticated;

SELECT 'v9 applied' AS status;
