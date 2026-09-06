ALTER TABLE public.fiscal_settings
  ADD COLUMN IF NOT EXISTS deduction_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS include_shipping_in_base boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS discount_reduces_base boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tax_retained boolean NOT NULL DEFAULT false;

ALTER TABLE public.fiscal_invoices
  ADD COLUMN IF NOT EXISTS base_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deduction_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS access_key text,
  ADD COLUMN IF NOT EXISTS verification_code text;