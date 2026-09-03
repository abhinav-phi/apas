-- ============================================================
-- v5_image_and_transfer.sql
-- 1. Add image_url column to products
-- 2. Setup product-images storage bucket policies (do in dashboard or here)
-- 3. Add RLS policies for ownership_transfers
-- Run in Supabase SQL Editor
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. product image_url column
-- ─────────────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ─────────────────────────────────────────────
-- 2. ownership_transfers: add status + notes columns
-- ─────────────────────────────────────────────
ALTER TABLE public.ownership_transfers
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed' NOT NULL;

ALTER TABLE public.ownership_transfers
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.ownership_transfers
  ADD COLUMN IF NOT EXISTS transfer_type TEXT DEFAULT 'manufacturer_to_supplier';

-- ─────────────────────────────────────────────
-- 3. RLS policies for ownership_transfers
-- ─────────────────────────────────────────────
ALTER TABLE public.ownership_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Manufacturers can insert transfers" ON public.ownership_transfers;
DROP POLICY IF EXISTS "Users can view own transfers" ON public.ownership_transfers;
DROP POLICY IF EXISTS "Admins can see all transfers" ON public.ownership_transfers;
DROP POLICY IF EXISTS "Authenticated users can insert transfers" ON public.ownership_transfers;
DROP POLICY IF EXISTS "Users can insert transfers" ON public.ownership_transfers;

-- Manufacturers and suppliers can create transfers for their products
CREATE POLICY "Authenticated users can insert transfers"
  ON public.ownership_transfers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user_id);

-- Users can see transfers they are part of (from or to)
CREATE POLICY "Users can view own transfers"
  ON public.ownership_transfers FOR SELECT TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id OR public.has_role(auth.uid(), 'admin'));

-- ─────────────────────────────────────────────
-- 4. Transfer RPC — validates ownership before transfer
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transfer_product_ownership(
  p_product_id UUID,
  p_to_email TEXT,
  p_transfer_type TEXT DEFAULT 'manufacturer_to_supplier',
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_product   RECORD;
  v_to_user   RECORD;
  v_transfer_hash TEXT;
BEGIN
  -- Find product
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Product not found');
  END IF;

  -- Check caller is manufacturer of this product or admin
  IF v_product.manufacturer_id != v_caller_id AND NOT public.has_role(v_caller_id, 'admin') THEN
    -- Check if caller is current owner (from a previous transfer)
    IF NOT EXISTS (
      SELECT 1 FROM public.ownership_transfers
      WHERE product_id = p_product_id AND to_user_id = v_caller_id
      ORDER BY created_at DESC LIMIT 1
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: you do not own this product');
    END IF;
  END IF;

  -- Find recipient by email
  SELECT au.id INTO v_to_user
  FROM auth.users au
  WHERE au.email = p_to_email;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No user found with email: ' || p_to_email);
  END IF;

  IF v_to_user.id = v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to yourself');
  END IF;

  -- Generate transfer hash
  v_transfer_hash := encode(
    digest(
      p_product_id::text || v_caller_id::text || v_to_user.id::text || now()::text,
      'sha256'
    ),
    'hex'
  );

  -- Insert transfer record
  INSERT INTO public.ownership_transfers (
    product_id, from_user_id, to_user_id, transfer_hash, status, notes, transfer_type
  ) VALUES (
    p_product_id, v_caller_id, v_to_user.id, v_transfer_hash, 'completed', p_notes, p_transfer_type
  );

  -- Log supply chain event for the transfer
  DECLARE
    v_last_hash TEXT;
    v_event_hash TEXT;
  BEGIN
    SELECT event_hash INTO v_last_hash
    FROM public.supply_chain_events
    WHERE product_id = p_product_id
    ORDER BY created_at DESC LIMIT 1;

    v_event_hash := encode(
      digest(p_product_id::text || 'transferred' || v_caller_id::text || now()::text || COALESCE(v_last_hash, 'genesis'), 'sha256'),
      'hex'
    );

    INSERT INTO public.supply_chain_events (
      product_id, actor_id, event_type, location, notes, previous_event_hash, event_hash
    ) VALUES (
      p_product_id, v_caller_id, 'transferred',
      NULL, 'Ownership transferred to ' || p_to_email,
      v_last_hash, v_event_hash
    );
  END;

  RETURN jsonb_build_object(
    'success', true,
    'transfer_hash', v_transfer_hash,
    'to_user_id', v_to_user.id,
    'message', 'Product transferred successfully'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_product_ownership(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────
-- 5. Storage bucket for product images
-- Run this separately if bucket doesn't exist:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true)
-- ON CONFLICT (id) DO NOTHING;
-- ─────────────────────────────────────────────

-- RLS for storage (if using storage.objects directly)
-- Note: In Supabase dashboard, set bucket to "Public" with authenticated uploads

-- ============================================================
-- DONE. Run this before using transfer/image features.
-- ============================================================
