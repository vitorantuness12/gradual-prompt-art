CREATE TABLE public.catalog_ai_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  upsell_ai_enabled boolean NOT NULL DEFAULT false,
  upsell_max integer NOT NULL DEFAULT 4,
  ai_notes text,
  last_ai_run_at timestamptz,
  autosort_enabled boolean NOT NULL DEFAULT false,
  autosort_window_days integer NOT NULL DEFAULT 30,
  autosort_scope text NOT NULL DEFAULT 'category',
  last_sort_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_ai_settings TO authenticated;
GRANT ALL ON public.catalog_ai_settings TO service_role;
ALTER TABLE public.catalog_ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe da loja gerencia ajustes de catalogo IA"
ON public.catalog_ai_settings FOR ALL TO authenticated
USING (public.is_store_staff(store_id, auth.uid()))
WITH CHECK (public.is_store_staff(store_id, auth.uid()));

CREATE TABLE public.store_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  monthly_revenue_goal numeric NOT NULL DEFAULT 0,
  daily_revenue_goal numeric NOT NULL DEFAULT 0,
  monthly_orders_goal integer NOT NULL DEFAULT 0,
  ticket_goal numeric NOT NULL DEFAULT 0,
  daily_summary_enabled boolean NOT NULL DEFAULT false,
  summary_hour integer NOT NULL DEFAULT 20,
  summary_whatsapp text,
  last_summary_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_goals TO authenticated;
GRANT ALL ON public.store_goals TO service_role;
ALTER TABLE public.store_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe da loja gerencia metas"
ON public.store_goals FOR ALL TO authenticated
USING (public.is_store_staff(store_id, auth.uid()))
WITH CHECK (public.is_store_staff(store_id, auth.uid()));

CREATE TRIGGER set_catalog_ai_settings_updated_at
BEFORE UPDATE ON public.catalog_ai_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_store_goals_updated_at
BEFORE UPDATE ON public.store_goals
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();