
-- Role enum
CREATE TYPE public.app_role AS ENUM ('manufacturer', 'supplier', 'customer', 'admin');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  company_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
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

-- Batches
CREATE TABLE public.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  manufacturer_id UUID NOT NULL REFERENCES auth.users(id),
  product_count INT NOT NULL DEFAULT 0,
  manufacture_date DATE,
  expiry_date DATE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view batches" ON public.batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manufacturers can insert batches" ON public.batches FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'manufacturer') AND auth.uid() = manufacturer_id);
CREATE POLICY "Manufacturers can update own batches" ON public.batches FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'manufacturer') AND auth.uid() = manufacturer_id);

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  origin_country TEXT,
  manufacture_date DATE,
  expiry_date DATE,
  batch_id UUID REFERENCES public.batches(id),
  manufacturer_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','recalled','expired','suspended')),
  verification_hash TEXT NOT NULL,
  qr_data TEXT NOT NULL UNIQUE,
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  flag_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manufacturers can insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'manufacturer') AND auth.uid() = manufacturer_id);
CREATE POLICY "Manufacturers can update own products" ON public.products FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'manufacturer') AND auth.uid() = manufacturer_id);
CREATE POLICY "Public can verify products" ON public.products FOR SELECT TO anon USING (true);

-- Supply chain events (append-only)
CREATE TABLE public.supply_chain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id),
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('manufactured','shipped','in_transit','received','delivered','sold','recalled','expired')),
  location TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  notes TEXT,
  previous_event_hash TEXT,
  event_hash TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.supply_chain_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view events" ON public.supply_chain_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Public can view events" ON public.supply_chain_events FOR SELECT TO anon USING (true);
CREATE POLICY "Manufacturers and suppliers can insert events" ON public.supply_chain_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'manufacturer') OR public.has_role(auth.uid(), 'supplier'));

-- Scan logs
CREATE TABLE public.scan_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id),
  scanner_id UUID REFERENCES auth.users(id),
  scan_location TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  ip_address TEXT,
  user_agent TEXT,
  is_suspicious BOOLEAN NOT NULL DEFAULT false,
  suspicion_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scan_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view scan logs" ON public.scan_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert scan logs" ON public.scan_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon can insert scan logs" ON public.scan_logs FOR INSERT TO anon WITH CHECK (true);

-- Fraud alerts
CREATE TABLE public.fraud_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('duplicate_scan','location_mismatch','invalid_sequence','manual_flag','rapid_scans')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  description TEXT NOT NULL,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fraud_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and manufacturers can view fraud alerts" ON public.fraud_alerts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manufacturer'));
CREATE POLICY "System can insert fraud alerts" ON public.fraud_alerts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can update fraud alerts" ON public.fraud_alerts FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Ownership transfers
CREATE TABLE public.ownership_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id),
  from_user_id UUID REFERENCES auth.users(id),
  to_user_id UUID NOT NULL REFERENCES auth.users(id),
  transfer_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ownership_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own transfers" ON public.ownership_transfers FOR SELECT TO authenticated USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
CREATE POLICY "Users can insert transfers" ON public.ownership_transfers FOR INSERT TO authenticated WITH CHECK (true);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Indexes
CREATE INDEX idx_products_manufacturer ON public.products(manufacturer_id);
CREATE INDEX idx_products_batch ON public.products(batch_id);
CREATE INDEX idx_products_status ON public.products(status);
CREATE INDEX idx_products_qr_data ON public.products(qr_data);
CREATE INDEX idx_events_product ON public.supply_chain_events(product_id);
CREATE INDEX idx_events_created ON public.supply_chain_events(created_at);
CREATE INDEX idx_scan_logs_product ON public.scan_logs(product_id);
CREATE INDEX idx_fraud_alerts_product ON public.fraud_alerts(product_id);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
