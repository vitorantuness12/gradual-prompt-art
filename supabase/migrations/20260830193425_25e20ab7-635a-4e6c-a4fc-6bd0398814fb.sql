ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS upsell_items integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upsell_total numeric NOT NULL DEFAULT 0;

ALTER TABLE public.loyalty_accounts
  ADD COLUMN IF NOT EXISTS cashback_expiry_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS loyalty_accounts_cashback_expires_idx
  ON public.loyalty_accounts (cashback_expires_at)
  WHERE cashback_balance > 0;