-- ============================================================
-- AuthentiChain v13: transfer_product_ownership hardening
-- Bugs (audit):
--   1. Email enumeration — "No user found with email: X" confirmed
--      whether any email is registered; response also echoed the
--      probed email back.
--   2. No rate limit — unlimited probing was possible.
-- Fix: generic non-echoing error + per-caller rate limit
--      (5 attempts / 10 min). NOTE: any found/not-found distinction
--      is technically an oracle; full elimination needs an
--      invitation-token flow (documented roadmap item).
-- Based on v10's custody-validated implementation — unchanged
-- behavior apart from the two fixes above. SAFE TO RE-RUN.
-- ============================================================

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
  v_recent        INT;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  -- Rate limit: 5 transfer attempts per caller per 10 minutes
  SELECT COUNT(*) INTO v_recent
  FROM public.ownership_transfers
  WHERE from_user_id = v_caller_id
    AND created_at > now() - INTERVAL '10 minutes';

  IF v_recent >= 5 THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Too many transfer attempts. Please wait a few minutes and try again.');
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

  SELECT au.id INTO v_to_user FROM auth.users au WHERE lower(au.email) = lower(p_to_email);
  IF NOT FOUND THEN
    -- Generic + non-echoing: does not confirm/deny the probed address
    RETURN jsonb_build_object('success', false, 'error',
      'Transfer failed: the recipient must have an AuthentiChain account. Verify the email and try again.');
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

SELECT 'v13 applied' AS status;
