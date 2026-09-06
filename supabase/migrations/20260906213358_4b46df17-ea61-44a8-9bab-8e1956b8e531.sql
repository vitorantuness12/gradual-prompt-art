ALTER TABLE public.subscription_invoices
  ADD COLUMN IF NOT EXISTS method text,
  ADD COLUMN IF NOT EXISTS refunded_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS subscription_invoices_store_created_idx
  ON public.subscription_invoices (store_id, created_at DESC);

DROP TRIGGER IF EXISTS set_subscription_invoices_updated_at ON public.subscription_invoices;
CREATE TRIGGER set_subscription_invoices_updated_at
  BEFORE UPDATE ON public.subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();