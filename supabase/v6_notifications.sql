-- ============================================================
-- v6_notifications.sql
-- 1. Create notifications table
-- 2. Setup RLS
-- 3. Trigger to auto-create notification when a fraud_alert is created
-- SAFE TO RE-RUN.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info', -- 'info', 'alert', 'success'
  is_read BOOLEAN NOT NULL DEFAULT false,
  link_url TEXT
);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Trigger: When a new fraud alert is created, notify the manufacturer of the product
CREATE OR REPLACE FUNCTION public.notify_on_fraud_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_manufacturer_id UUID;
  v_product_name TEXT;
BEGIN
  -- Get the manufacturer of the flagged product
  SELECT manufacturer_id, name INTO v_manufacturer_id, v_product_name
  FROM public.products
  WHERE id = NEW.product_id;

  IF FOUND AND v_manufacturer_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id, title, message, type, link_url
    ) VALUES (
      v_manufacturer_id,
      'Fraud Alert: ' || NEW.alert_type,
      'Suspicious activity detected for product: ' || v_product_name || ' (' || NEW.description || ')',
      'alert',
      '/alerts'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_fraud_alert ON public.fraud_alerts;
CREATE TRIGGER trg_notify_on_fraud_alert
  AFTER INSERT ON public.fraud_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_fraud_alert();
