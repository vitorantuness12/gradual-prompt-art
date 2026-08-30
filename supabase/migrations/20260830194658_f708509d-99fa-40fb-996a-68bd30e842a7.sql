ALTER TABLE public.customer_subscriptions
  ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;