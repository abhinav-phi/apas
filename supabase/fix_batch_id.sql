-- ============================================================
-- FIX: Add missing 'batch_id' column to products table
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add the batch_id column (nullable FK to batches)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.batches(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_products_batch ON public.products(batch_id);
