ALTER TABLE public.fiscal_settings
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'homologacao',
  ADD COLUMN IF NOT EXISTS tax_regime TEXT,
  ADD COLUMN IF NOT EXISTS cnae TEXT;

ALTER TABLE public.fiscal_invoices
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS xml_url TEXT;

CREATE INDEX IF NOT EXISTS fiscal_invoices_store_created_idx
  ON public.fiscal_invoices (store_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_invoices_provider_external_idx
  ON public.fiscal_invoices (store_id, provider, external_id)
  WHERE external_id IS NOT NULL;