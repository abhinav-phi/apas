-- ============================================================
-- AuthentiChain v11: Batch product_count sync (BAT-04/BAT-05)
-- Bug: batches.product_count was NEVER written by any code path —
--      Batches page always displayed 0 regardless of contents.
-- Fix: triggers keep the denormalized counter exact on product
--      INSERT / batch re-assignment / DELETE + one-time backfill.
-- SAFE TO RE-RUN.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_batch_product_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Product moved OUT of a batch (update or delete)
  IF (TG_OP = 'DELETE') OR (TG_OP = 'UPDATE' AND OLD.batch_id IS NOT NULL AND OLD.batch_id IS DISTINCT FROM NEW.batch_id) THEN
    UPDATE public.batches
    SET product_count = GREATEST(0, product_count - 1)
    WHERE id = OLD.batch_id;
  END IF;

  -- Product moved INTO a batch (insert or update)
  IF (TG_OP = 'INSERT' AND NEW.batch_id IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.batch_id IS NOT NULL AND NEW.batch_id IS DISTINCT FROM OLD.batch_id) THEN
    UPDATE public.batches
    SET product_count = product_count + 1
    WHERE id = NEW.batch_id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS products_batch_count_sync ON public.products;
CREATE TRIGGER products_batch_count_sync
  AFTER INSERT OR DELETE OR UPDATE OF batch_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.sync_batch_product_count();

-- One-time backfill so existing data is correct immediately
UPDATE public.batches b
SET product_count = (SELECT COUNT(*) FROM public.products p WHERE p.batch_id = b.id);

SELECT 'v11 applied' AS status;
