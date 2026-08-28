ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS customers_store_phone_e164_key
  ON public.customers (store_id, phone_e164)
  WHERE phone_e164 IS NOT NULL;

CREATE INDEX IF NOT EXISTS customers_phone_e164_idx ON public.customers (phone_e164);

CREATE TABLE public.customer_addresses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  label text,
  street text,
  number text,
  complement text,
  reference text,
  district text,
  city text,
  state text,
  zip_code text,
  latitude numeric,
  longitude numeric,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_addresses TO authenticated;
GRANT ALL ON public.customer_addresses TO service_role;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe da loja gerencia enderecos dos clientes"
  ON public.customer_addresses FOR ALL TO authenticated
  USING (public.is_store_staff(store_id, auth.uid()))
  WITH CHECK (public.is_store_staff(store_id, auth.uid()));

CREATE INDEX customer_addresses_customer_idx ON public.customer_addresses (customer_id);
CREATE INDEX customer_addresses_store_idx ON public.customer_addresses (store_id);
CREATE TRIGGER customer_addresses_updated_at BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.customer_consents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  phone_e164 text,
  kind text NOT NULL CHECK (kind IN ('terms','privacy','marketing','profile')),
  accepted boolean NOT NULL DEFAULT true,
  source text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.customer_consents TO authenticated;
GRANT ALL ON public.customer_consents TO service_role;
ALTER TABLE public.customer_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe da loja consulta aceites"
  ON public.customer_consents FOR SELECT TO authenticated
  USING (public.is_store_staff(store_id, auth.uid()));

CREATE INDEX customer_consents_customer_idx ON public.customer_consents (customer_id);
CREATE INDEX customer_consents_store_idx ON public.customer_consents (store_id, kind);

CREATE TABLE public.store_checkout_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  require_phone boolean NOT NULL DEFAULT true,
  allow_guest boolean NOT NULL DEFAULT true,
  allow_quick_register boolean NOT NULL DEFAULT true,
  require_verification boolean NOT NULL DEFAULT false,
  allow_phone_lookup boolean NOT NULL DEFAULT true,
  allow_public_tracking boolean NOT NULL DEFAULT true,
  allow_repeat_order boolean NOT NULL DEFAULT true,
  tracking_link_days integer NOT NULL DEFAULT 30,
  notification_channels jsonb NOT NULL DEFAULT '{"whatsapp":true,"email":true,"sms":false,"push":false}'::jsonb,
  require_email boolean NOT NULL DEFAULT false,
  require_full_address boolean NOT NULL DEFAULT true,
  history_retention_days integer NOT NULL DEFAULT 365,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.store_checkout_settings TO authenticated;
GRANT SELECT ON public.store_checkout_settings TO anon;
GRANT ALL ON public.store_checkout_settings TO service_role;
ALTER TABLE public.store_checkout_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Preferencias de checkout sao publicas para leitura"
  ON public.store_checkout_settings FOR SELECT
  USING (true);
CREATE POLICY "Equipe da loja cria preferencias de checkout"
  ON public.store_checkout_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_store_permission(store_id, auth.uid(), 'configuracoes'));
CREATE POLICY "Equipe da loja atualiza preferencias de checkout"
  ON public.store_checkout_settings FOR UPDATE TO authenticated
  USING (public.has_store_permission(store_id, auth.uid(), 'configuracoes'))
  WITH CHECK (public.has_store_permission(store_id, auth.uid(), 'configuracoes'));

CREATE TRIGGER store_checkout_settings_updated_at BEFORE UPDATE ON public.store_checkout_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();