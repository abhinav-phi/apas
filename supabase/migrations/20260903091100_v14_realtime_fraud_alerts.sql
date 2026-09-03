-- FRD-06 (P0): real-time fraud alert feed on the Alerts page.
--
-- Supabase only delivers a table's changes over postgres_changes when that
-- table is a member of the `supabase_realtime` publication. `notifications`
-- was already a member (the bell dropdown updates live), but `fraud_alerts`
-- was not — so the Alerts page could never receive live inserts and admins
-- had to refresh manually, defeating the product's "24/7 fraud monitoring"
-- selling point.
--
-- RLS on fraud_alerts (admin OR manufacturer may SELECT) governs which rows a
-- given client actually receives over the channel, so no policy change is
-- needed here.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'fraud_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.fraud_alerts;
  END IF;
END $$;
