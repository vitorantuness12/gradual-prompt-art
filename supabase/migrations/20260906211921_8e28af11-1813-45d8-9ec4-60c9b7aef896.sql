ALTER TABLE public.fiscal_settings
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS trade_name text,
  ADD COLUMN IF NOT EXISTS state_registration text,
  ADD COLUMN IF NOT EXISTS company_email text,
  ADD COLUMN IF NOT EXISTS company_phone text,
  ADD COLUMN IF NOT EXISTS address_line text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_state text,
  ADD COLUMN IF NOT EXISTS address_zip text,
  ADD COLUMN IF NOT EXISTS invoice_model text NOT NULL DEFAULT 'nfse',
  ADD COLUMN IF NOT EXISTS invoice_series text NOT NULL DEFAULT '1',
  ADD COLUMN IF NOT EXISTS next_invoice_number integer NOT NULL DEFAULT 1;

ALTER TABLE public.fiscal_invoices
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS series text;

ALTER TABLE public.automation_rules
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.data_requests
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS handled_by uuid,
  ADD COLUMN IF NOT EXISTS handled_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS data_requests_store_created_idx ON public.data_requests (store_id, created_at DESC);

DROP TRIGGER IF EXISTS set_data_requests_updated_at ON public.data_requests;
CREATE TRIGGER set_data_requests_updated_at
  BEFORE UPDATE ON public.data_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "Equipe da loja ve solicitacoes da loja" ON public.data_requests;
CREATE POLICY "Equipe da loja ve solicitacoes da loja"
  ON public.data_requests FOR SELECT TO authenticated
  USING (store_id IS NOT NULL AND public.is_store_staff(store_id, auth.uid()));

DROP POLICY IF EXISTS "Equipe da loja responde solicitacoes da loja" ON public.data_requests;
CREATE POLICY "Equipe da loja responde solicitacoes da loja"
  ON public.data_requests FOR UPDATE TO authenticated
  USING (store_id IS NOT NULL AND public.is_store_staff(store_id, auth.uid()))
  WITH CHECK (store_id IS NOT NULL AND public.is_store_staff(store_id, auth.uid()));