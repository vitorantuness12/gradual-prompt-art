-- lovable-cron-fallback-reviewed: 288 runs/day; scheduled customer campaigns need delivery within a five-minute window and no enabled delayed-workflow provider is available
CREATE TABLE public.push_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  name text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  audience_type text NOT NULL DEFAULT 'all',
  audience_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  schedule_type text NOT NULL DEFAULT 'now',
  scheduled_at timestamptz,
  recurrence jsonb NOT NULL DEFAULT '{}'::jsonb,
  automatic_event text,
  quiet_hours jsonb NOT NULL DEFAULT '{"enabled":true,"start":"21:00","end":"08:00"}'::jsonb,
  frequency_cap_hours integer NOT NULL DEFAULT 24,
  status text NOT NULL DEFAULT 'draft',
  next_run_at timestamptz,
  last_run_at timestamptz,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  removed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_campaigns_name_length CHECK (char_length(name) BETWEEN 2 AND 80),
  CONSTRAINT push_campaigns_title_length CHECK (char_length(title) BETWEEN 2 AND 80),
  CONSTRAINT push_campaigns_body_length CHECK (char_length(body) BETWEEN 2 AND 240),
  CONSTRAINT push_campaigns_audience_type CHECK (audience_type IN ('all','new','active','recurring','inactive','birthday','abandoned_cart','post_purchase')),
  CONSTRAINT push_campaigns_schedule_type CHECK (schedule_type IN ('now','scheduled','recurring','automatic')),
  CONSTRAINT push_campaigns_status CHECK (status IN ('draft','scheduled','sending','sent','paused','cancelled')),
  CONSTRAINT push_campaigns_frequency_cap CHECK (frequency_cap_hours BETWEEN 1 AND 720)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_campaigns TO authenticated;
GRANT ALL ON public.push_campaigns TO service_role;
ALTER TABLE public.push_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_campaigns_staff_read" ON public.push_campaigns FOR SELECT TO authenticated USING (public.has_store_permission(store_id, auth.uid(), 'customers'));
CREATE POLICY "push_campaigns_staff_insert" ON public.push_campaigns FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND public.has_store_permission(store_id, auth.uid(), 'customers'));
CREATE POLICY "push_campaigns_staff_update" ON public.push_campaigns FOR UPDATE TO authenticated USING (public.has_store_permission(store_id, auth.uid(), 'customers')) WITH CHECK (public.has_store_permission(store_id, auth.uid(), 'customers'));
CREATE POLICY "push_campaigns_staff_delete" ON public.push_campaigns FOR DELETE TO authenticated USING (public.has_store_permission(store_id, auth.uid(), 'customers'));
CREATE INDEX push_campaigns_store_status_idx ON public.push_campaigns(store_id, status, next_run_at);
CREATE INDEX push_campaigns_due_idx ON public.push_campaigns(next_run_at) WHERE status = 'scheduled';
CREATE TRIGGER set_push_campaigns_updated_at BEFORE UPDATE ON public.push_campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.push_subscription_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  consented_at timestamptz,
  revoked_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subscription_id, store_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscription_stores TO authenticated;
GRANT ALL ON public.push_subscription_stores TO service_role;
ALTER TABLE public.push_subscription_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_subscription_stores_own" ON public.push_subscription_stores FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_subscription_stores_staff_read" ON public.push_subscription_stores FOR SELECT TO authenticated USING (public.has_store_permission(store_id, auth.uid(), 'customers'));
CREATE INDEX push_subscription_stores_store_active_idx ON public.push_subscription_stores(store_id, is_active, user_id);
CREATE INDEX push_subscription_stores_customer_idx ON public.push_subscription_stores(customer_id) WHERE customer_id IS NOT NULL;
CREATE TRIGGER set_push_subscription_stores_updated_at BEFORE UPDATE ON public.push_subscription_stores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.push_campaign_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.push_campaigns(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.push_subscriptions(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  run_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, subscription_id, run_key),
  CONSTRAINT push_campaign_deliveries_status CHECK (status IN ('pending','sent','failed','expired','skipped'))
);
GRANT SELECT ON public.push_campaign_deliveries TO authenticated;
GRANT ALL ON public.push_campaign_deliveries TO service_role;
ALTER TABLE public.push_campaign_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_campaign_deliveries_staff_read" ON public.push_campaign_deliveries FOR SELECT TO authenticated USING (public.has_store_permission(store_id, auth.uid(), 'customers'));
CREATE INDEX push_campaign_deliveries_campaign_idx ON public.push_campaign_deliveries(campaign_id, created_at DESC);
CREATE INDEX push_campaign_deliveries_store_status_idx ON public.push_campaign_deliveries(store_id, status, created_at DESC);
CREATE TRIGGER set_push_campaign_deliveries_updated_at BEFORE UPDATE ON public.push_campaign_deliveries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.cron_tokens (name, token)
VALUES ('notificacoes_push', replace(gen_random_uuid()::text, '-', ''))
ON CONFLICT (name) DO NOTHING;
DO $$ BEGIN PERFORM cron.unschedule('notificacoes-push-campanhas'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'notificacoes-push-campanhas', '*/5 * * * *',
  $$ SELECT net.http_post(
    url := 'https://project--f3db66ea-9c1c-435c-8b46-510d9e02947b.lovable.app/api/public/notificacoes/push',
    headers := jsonb_build_object('content-type','application/json','authorization','Bearer ' || (SELECT token FROM public.cron_tokens WHERE name='notificacoes_push')),
    body := '{"source":"pg_cron"}'::jsonb
  ); $$
);