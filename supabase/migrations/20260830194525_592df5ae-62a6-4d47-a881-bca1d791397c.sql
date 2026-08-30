ALTER TABLE public.customer_subscriptions
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_address jsonb,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS delivery_type text NOT NULL DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_order_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_order_at timestamptz,
  ADD COLUMN IF NOT EXISTS orders_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS resumes_at timestamptz;

ALTER TABLE public.customer_subscriptions
  ADD CONSTRAINT customer_subscriptions_quantity_check CHECK (quantity > 0) NOT VALID;

ALTER TABLE public.customer_subscriptions
  ADD CONSTRAINT customer_subscriptions_delivery_type_check
  CHECK (delivery_type IN ('delivery', 'pickup')) NOT VALID;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.customer_subscriptions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS customer_subscriptions_next_order_idx
  ON public.customer_subscriptions (next_order_at)
  WHERE status IN ('active', 'trialing');

CREATE INDEX IF NOT EXISTS orders_subscription_id_idx
  ON public.orders (subscription_id)
  WHERE subscription_id IS NOT NULL;