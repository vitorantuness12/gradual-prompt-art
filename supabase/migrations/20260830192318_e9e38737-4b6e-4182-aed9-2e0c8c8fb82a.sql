-- ============ 1. Idempotência da rotina agendada ============
ALTER TABLE public.cron_tokens
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_result jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS cron_tokens_name_key ON public.cron_tokens (name);

INSERT INTO public.cron_tokens (name, token)
VALUES ('carrinho_abandonado', replace(gen_random_uuid()::text, '-', ''))
ON CONFLICT (name) DO NOTHING;

-- Reserva atômica da execução: só devolve true se a última rodada já passou
-- da janela mínima. Evita que duas chamadas simultâneas disparem mensagens
-- duplicadas para o mesmo carrinho.
CREATE OR REPLACE FUNCTION public.claim_cron_run(_name text, _min_interval_seconds integer DEFAULT 300)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _claimed boolean := false;
BEGIN
  UPDATE public.cron_tokens
     SET last_run_at = now()
   WHERE name = _name
     AND (last_run_at IS NULL OR last_run_at < now() - make_interval(secs => _min_interval_seconds))
  RETURNING true INTO _claimed;

  RETURN COALESCE(_claimed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_cron_run(text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_cron_run(text, integer) TO service_role;

-- ============ 2. Cashback em R$ com validade ============
ALTER TABLE public.loyalty_settings
  ADD COLUMN IF NOT EXISTS cashback_expiration_days integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS cashback_min_order numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cashback_max_percent_use numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS referral_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_cashback_referrer numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_cashback_referred numeric NOT NULL DEFAULT 0;

ALTER TABLE public.loyalty_accounts
  ADD COLUMN IF NOT EXISTS cashback_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS referral_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_rewarded_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_accounts_store_referral_code_key
  ON public.loyalty_accounts (store_id, referral_code)
  WHERE referral_code IS NOT NULL;

-- ============ 3. Código de indicação no pedido ============
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS referral_code text;

-- ============ 4. Agendamento (a cada 10 minutos) ============
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('carrinho-abandonado-lembretes');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'carrinho-abandonado-lembretes',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--f3db66ea-9c1c-435c-8b46-510d9e02947b.lovable.app/api/public/carrinho/lembretes',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || (SELECT token FROM public.cron_tokens WHERE name = 'carrinho_abandonado')
    ),
    body := '{"source":"pg_cron"}'::jsonb
  );
  $$
);