-- ============================================================
-- FIX: Add ALL missing columns to the products table
-- Run this in Supabase SQL Editor (safe to re-run)
-- ============================================================

-- Add every column the app expects. IF NOT EXISTS makes it safe to re-run.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS origin_country TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS manufacture_date DATE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS batch_id UUID;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS manufacturer_id UUID;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS verification_hash TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS qr_data TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS flag_reason TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ============================================================
-- Also ensure other tables have all expected columns
-- ============================================================

-- profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- user_roles
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role TEXT;

-- batches
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS batch_code TEXT;
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS manufacturer_id UUID;
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS product_count INT DEFAULT 0;
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS manufacture_date DATE;
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- supply_chain_events
ALTER TABLE public.supply_chain_events ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE public.supply_chain_events ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE public.supply_chain_events ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE public.supply_chain_events ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.supply_chain_events ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.supply_chain_events ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE public.supply_chain_events ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.supply_chain_events ADD COLUMN IF NOT EXISTS previous_event_hash TEXT;
ALTER TABLE public.supply_chain_events ADD COLUMN IF NOT EXISTS event_hash TEXT;
ALTER TABLE public.supply_chain_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE public.supply_chain_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- scan_logs
ALTER TABLE public.scan_logs ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE public.scan_logs ADD COLUMN IF NOT EXISTS scanner_id UUID;
ALTER TABLE public.scan_logs ADD COLUMN IF NOT EXISTS scan_location TEXT;
ALTER TABLE public.scan_logs ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.scan_logs ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE public.scan_logs ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.scan_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.scan_logs ADD COLUMN IF NOT EXISTS is_suspicious BOOLEAN DEFAULT false;
ALTER TABLE public.scan_logs ADD COLUMN IF NOT EXISTS suspicion_reason TEXT;
ALTER TABLE public.scan_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- fraud_alerts
ALTER TABLE public.fraud_alerts ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE public.fraud_alerts ADD COLUMN IF NOT EXISTS alert_type TEXT;
ALTER TABLE public.fraud_alerts ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'medium';
ALTER TABLE public.fraud_alerts ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.fraud_alerts ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN DEFAULT false;
ALTER TABLE public.fraud_alerts ADD COLUMN IF NOT EXISTS resolved_by UUID;
ALTER TABLE public.fraud_alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE public.fraud_alerts ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE public.fraud_alerts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- ownership_transfers
ALTER TABLE public.ownership_transfers ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE public.ownership_transfers ADD COLUMN IF NOT EXISTS from_user_id UUID;
ALTER TABLE public.ownership_transfers ADD COLUMN IF NOT EXISTS to_user_id UUID;
ALTER TABLE public.ownership_transfers ADD COLUMN IF NOT EXISTS transfer_hash TEXT;
ALTER TABLE public.ownership_transfers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- ============================================================
-- DONE! This covers every column the app expects.
-- Hard-refresh localhost:8080 and try registering again.
-- ============================================================
