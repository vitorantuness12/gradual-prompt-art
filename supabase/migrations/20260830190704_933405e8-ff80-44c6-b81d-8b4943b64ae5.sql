CREATE TABLE public.abandoned_carts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  phone_e164 text NOT NULL,
  customer_name text,
  token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  address jsonb,
  coupon_code text,
  reminder_count integer NOT NULL DEFAULT 0,
  reminder_sent_at timestamptz,
  recovered_at timestamptz,
  recovered_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT abandoned_carts_token_key UNIQUE (token),
  CONSTRAINT abandoned_carts_store_phone_key UNIQUE (store_id, phone_e164)
);

CREATE INDEX abandoned_carts_pending_idx
  ON public.abandoned_carts (last_activity_at)
  WHERE recovered_at IS NULL;

CREATE INDEX abandoned_carts_store_idx ON public.abandoned_carts (store_id, last_activity_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.abandoned_carts TO authenticated;
GRANT ALL ON public.abandoned_carts TO service_role;

ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe da loja ve carrinhos abandonados"
  ON public.abandoned_carts FOR SELECT TO authenticated
  USING (public.is_store_staff(store_id, auth.uid()));

CREATE POLICY "Equipe da loja gerencia carrinhos abandonados"
  ON public.abandoned_carts FOR UPDATE TO authenticated
  USING (public.is_store_staff(store_id, auth.uid()))
  WITH CHECK (public.is_store_staff(store_id, auth.uid()));

CREATE POLICY "Equipe da loja remove carrinhos abandonados"
  ON public.abandoned_carts FOR DELETE TO authenticated
  USING (public.is_store_staff(store_id, auth.uid()));

CREATE TRIGGER abandoned_carts_updated_at
  BEFORE UPDATE ON public.abandoned_carts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.store_checkout_settings
  ADD COLUMN abandoned_cart_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN abandoned_cart_delay_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN abandoned_cart_coupon_code text,
  ADD COLUMN upsell_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN upsell_max_items integer NOT NULL DEFAULT 4;