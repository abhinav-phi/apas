-- ============================================================
-- AuthentiChain v8: Automation — Auto-Expiry + Daily Stats Rollup
-- Implements: ImplementationPlan 4.8, AppFlow §2 (ANY→expired),
--             Phase 2 "Daily Stats Rollup" performance note.
-- Requires: v7_server_event_rpc.sql (system_actor_id + hash format)
-- SAFE TO RE-RUN.
-- ============================================================

-- ┌─────────────────────────────────────────────────┐
-- │ 1. SYSTEM ACTOR (actor_id FK is NOT NULL)        │
-- └─────────────────────────────────────────────────┘
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = public.system_actor_id()) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      public.system_actor_id(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'system@authentichain.internal',
      extensions.crypt(encode(extensions.gen_random_bytes(18), 'hex'), extensions.gen_salt('bf')),  -- random, unguessable; account is not for login
      now(), now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"full_name": "AuthentiChain System", "is_system": true}'::jsonb,
      now(), now()
    );
  END IF;
END;
$$;

-- Profile row for the system actor
INSERT INTO public.profiles (user_id, full_name, company_name)
VALUES (public.system_actor_id(), 'AuthentiChain System', 'AuthentiChain')
ON CONFLICT (user_id) DO NOTHING;

-- ┌─────────────────────────────────────────────────┐
-- │ 2. AUTO-EXPIRY JOB                               │
-- │    ANY → expired (system actor), AppFlow §2      │
-- └─────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION public.expire_products_daily()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expired INT := 0;
  v_product RECORD;
  v_prev_hash TEXT;
  v_event_hash TEXT;
  v_now TIMESTAMPTZ := now();
  v_system UUID := public.system_actor_id();
BEGIN
  FOR v_product IN
    SELECT id, product_code, name, manufacturer_id
    FROM public.products
    WHERE status = 'active'
      AND expiry_date IS NOT NULL
      AND expiry_date < current_date
    ORDER BY created_at
  LOOP
    -- Chain onto the true latest event (same formula as v7 RPC)
    SELECT event_hash INTO v_prev_hash
    FROM public.supply_chain_events
    WHERE product_id = v_product.id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    v_event_hash := encode(
      sha256(convert_to(
        v_product.id::text || '|expired|' || v_system::text || '|' || v_now::text || '|' || COALESCE(v_prev_hash, 'genesis'),
        'UTF8'
      )),
      'hex'
    );

    UPDATE public.products
    SET status = 'expired'
    WHERE id = v_product.id;

    INSERT INTO public.supply_chain_events (
      product_id, actor_id, event_type, notes,
      previous_event_hash, event_hash, created_at
    ) VALUES (
      v_product.id, v_system, 'expired',
      'Automated expiry: expiry date ' || v_product.expiry_date::text || ' has passed.',
      v_prev_hash, v_event_hash, v_now
    );

    -- Notify the manufacturer in-app (v6 notifications table)
    -- NOTE: v6 column names are `message` and `link_url` (NOT body/link).
    INSERT INTO public.notifications (user_id, title, message, type, link_url)
    VALUES (
      v_product.manufacturer_id,
      'Product auto-expired',
      'Product ' || v_product.product_code || ' (' || v_product.name || ') passed its expiry date and is now marked expired.',
      'system',
      '/products/' || v_product.id::text
    );

    v_expired := v_expired + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'expired_count', v_expired, 'ran_at', v_now);
END;
$$;

-- ┌─────────────────────────────────────────────────┐
-- │ 3. DAILY STATS ROLLUP                            │
-- │    Analytics "All" range reads this table        │
-- │    instead of re-aggregating full history live.  │
-- └─────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS public.daily_stats (
  day DATE PRIMARY KEY,
  products_created INT NOT NULL DEFAULT 0,
  scans INT NOT NULL DEFAULT 0,
  events INT NOT NULL DEFAULT 0,
  alerts INT NOT NULL DEFAULT 0,
  new_users INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view daily stats" ON public.daily_stats;
CREATE POLICY "Admins can view daily stats"
  ON public.daily_stats FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Rebuild the last N days (idempotent; today stays a live partial)
CREATE OR REPLACE FUNCTION public.refresh_daily_stats(p_days INT DEFAULT 3)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.daily_stats AS ds (day, products_created, scans, events, alerts, new_users, updated_at)
  SELECT
    d::date AS day,
    (SELECT COUNT(*) FROM public.products p WHERE p.created_at::date = d::date),
    (SELECT COUNT(*) FROM public.scan_logs s WHERE s.created_at::date = d::date),
    (SELECT COUNT(*) FROM public.supply_chain_events e WHERE e.created_at::date = d::date),
    (SELECT COUNT(*) FROM public.fraud_alerts f WHERE f.created_at::date = d::date),
    (SELECT COUNT(*) FROM auth.users u WHERE u.created_at::date = d::date),
    now()
  FROM generate_series(current_date - (p_days - 1), current_date, INTERVAL '1 day') AS d
  ON CONFLICT (day) DO UPDATE SET
    products_created = EXCLUDED.products_created,
    scans = EXCLUDED.scans,
    events = EXCLUDED.events,
    alerts = EXCLUDED.alerts,
    new_users = EXCLUDED.new_users,
    updated_at = now();
$$;

GRANT EXECUTE ON FUNCTION public.refresh_daily_stats(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_products_daily() TO authenticated; -- manual trigger from admin tooling allowed

-- ┌─────────────────────────────────────────────────┐
-- │ 4. pg_cron SCHEDULES                             │
-- └─────────────────────────────────────────────────┘
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron not available — enable it in the Supabase dashboard, then re-run this section.';
      RETURN;
    END;
  END IF;

  -- Replace any previous schedule with the same name (idempotent)
  BEGIN
    PERFORM cron.unschedule('authentichain-auto-expiry');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    PERFORM cron.unschedule('authentichain-daily-stats');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Daily 00:05 UTC: expire products past their expiry date
  PERFORM cron.schedule(
    'authentichain-auto-expiry',
    '5 0 * * *',
    $$SELECT public.expire_products_daily();$$
  );

  -- Daily 00:10 UTC: rebuild the daily stats rollup
  PERFORM cron.schedule(
    'authentichain-daily-stats',
    '10 0 * * *',
    $$SELECT public.refresh_daily_stats(2);$$
  );

  RAISE NOTICE 'Cron jobs scheduled: authentichain-auto-expiry (00:05 UTC), authentichain-daily-stats (00:10 UTC)';
END;
$do$;

SELECT 'v8 applied' AS status;
