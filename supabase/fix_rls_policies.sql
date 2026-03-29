-- ============================================================
-- FIX: Create has_role function + ALL RLS policies
-- This is the final comprehensive fix. Run in Supabase SQL Editor.
-- ============================================================

-- ┌─────────────────────────────────────────────────┐
-- │ 1. Create has_role() function (no enum needed)  │
-- └─────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- ┌─────────────────────────────────────────────────┐
-- │ 2. PRODUCTS policies                            │
-- └─────────────────────────────────────────────────┘
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;
CREATE POLICY "Authenticated users can view products" ON public.products
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Public can verify products" ON public.products;
CREATE POLICY "Public can verify products" ON public.products
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Manufacturers can insert products" ON public.products;
CREATE POLICY "Manufacturers can insert products" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'manufacturer') AND auth.uid() = manufacturer_id);

DROP POLICY IF EXISTS "Manufacturers can update own products" ON public.products;
CREATE POLICY "Manufacturers can update own products" ON public.products
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'manufacturer') AND auth.uid() = manufacturer_id);

-- ┌─────────────────────────────────────────────────┐
-- │ 3. PROFILES policies                            │
-- └─────────────────────────────────────────────────┘
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ┌─────────────────────────────────────────────────┐
-- │ 4. USER_ROLES policies                          │
-- └─────────────────────────────────────────────────┘
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own roles" ON public.user_roles;
CREATE POLICY "Users can insert own roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ┌─────────────────────────────────────────────────┐
-- │ 5. BATCHES policies                             │
-- └─────────────────────────────────────────────────┘
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view batches" ON public.batches;
CREATE POLICY "Authenticated can view batches" ON public.batches
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Manufacturers can insert batches" ON public.batches;
CREATE POLICY "Manufacturers can insert batches" ON public.batches
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'manufacturer') AND auth.uid() = manufacturer_id);

DROP POLICY IF EXISTS "Manufacturers can update own batches" ON public.batches;
CREATE POLICY "Manufacturers can update own batches" ON public.batches
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'manufacturer') AND auth.uid() = manufacturer_id);

-- ┌─────────────────────────────────────────────────┐
-- │ 6. SUPPLY_CHAIN_EVENTS policies                 │
-- └─────────────────────────────────────────────────┘
ALTER TABLE public.supply_chain_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view events" ON public.supply_chain_events;
CREATE POLICY "Authenticated can view events" ON public.supply_chain_events
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Public can view events" ON public.supply_chain_events;
CREATE POLICY "Public can view events" ON public.supply_chain_events
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Manufacturers and suppliers can insert events" ON public.supply_chain_events;
CREATE POLICY "Manufacturers and suppliers can insert events" ON public.supply_chain_events
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'manufacturer') OR public.has_role(auth.uid(), 'supplier'));

-- ┌─────────────────────────────────────────────────┐
-- │ 7. SCAN_LOGS policies                           │
-- └─────────────────────────────────────────────────┘
ALTER TABLE public.scan_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view scan logs" ON public.scan_logs;
CREATE POLICY "Authenticated can view scan logs" ON public.scan_logs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can insert scan logs" ON public.scan_logs;
CREATE POLICY "Anyone can insert scan logs" ON public.scan_logs
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can insert scan logs" ON public.scan_logs;
CREATE POLICY "Anon can insert scan logs" ON public.scan_logs
  FOR INSERT TO anon WITH CHECK (true);

-- ┌─────────────────────────────────────────────────┐
-- │ 8. FRAUD_ALERTS policies                        │
-- └─────────────────────────────────────────────────┘
ALTER TABLE public.fraud_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and manufacturers can view fraud alerts" ON public.fraud_alerts;
CREATE POLICY "Admins and manufacturers can view fraud alerts" ON public.fraud_alerts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manufacturer'));

DROP POLICY IF EXISTS "System can insert fraud alerts" ON public.fraud_alerts;
CREATE POLICY "System can insert fraud alerts" ON public.fraud_alerts
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can insert fraud alerts" ON public.fraud_alerts;
CREATE POLICY "Anon can insert fraud alerts" ON public.fraud_alerts
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can update fraud alerts" ON public.fraud_alerts;
CREATE POLICY "Admins can update fraud alerts" ON public.fraud_alerts
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ┌─────────────────────────────────────────────────┐
-- │ 9. OWNERSHIP_TRANSFERS policies                 │
-- └─────────────────────────────────────────────────┘
ALTER TABLE public.ownership_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own transfers" ON public.ownership_transfers;
CREATE POLICY "Users can view own transfers" ON public.ownership_transfers
  FOR SELECT TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

DROP POLICY IF EXISTS "Users can insert transfers" ON public.ownership_transfers;
CREATE POLICY "Users can insert transfers" ON public.ownership_transfers
  FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- DONE! Hard-refresh localhost:8080 and try again.
-- ============================================================
