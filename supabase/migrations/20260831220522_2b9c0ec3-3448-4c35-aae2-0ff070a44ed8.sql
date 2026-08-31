CREATE TABLE public.member_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  email text NOT NULL,
  password_hash text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, email)
);
CREATE INDEX member_accounts_store_idx ON public.member_accounts(store_id);
GRANT SELECT ON public.member_accounts TO authenticated;
GRANT ALL ON public.member_accounts TO service_role;
ALTER TABLE public.member_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe da loja ve os membros" ON public.member_accounts FOR SELECT TO authenticated USING (public.is_store_staff(store_id, auth.uid()));
CREATE TRIGGER member_accounts_updated_at BEFORE UPDATE ON public.member_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.member_sessions (
  token text PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES public.member_accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX member_sessions_member_idx ON public.member_sessions(member_id);
GRANT ALL ON public.member_sessions TO service_role;
ALTER TABLE public.member_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.member_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'file' CHECK (kind IN ('file','link')),
  file_path text,
  url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX member_resources_product_idx ON public.member_resources(product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_resources TO authenticated;
GRANT ALL ON public.member_resources TO service_role;
ALTER TABLE public.member_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe da loja gerencia materiais" ON public.member_resources FOR ALL TO authenticated USING (public.is_store_staff(store_id, auth.uid())) WITH CHECK (public.is_store_staff(store_id, auth.uid()));
CREATE TRIGGER member_resources_updated_at BEFORE UPDATE ON public.member_resources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();