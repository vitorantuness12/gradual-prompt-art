INSERT INTO public.cron_tokens (name, token)
VALUES ('assinaturas_pedidos', replace(gen_random_uuid()::text, '-', ''))
ON CONFLICT (name) DO NOTHING;

DO $$
BEGIN
  PERFORM cron.unschedule('assinaturas-pedidos-recorrentes');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'assinaturas-pedidos-recorrentes',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--f3db66ea-9c1c-435c-8b46-510d9e02947b.lovable.app/api/public/assinaturas/pedidos',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || (SELECT token FROM public.cron_tokens WHERE name = 'assinaturas_pedidos')
    ),
    body := '{"source":"pg_cron"}'::jsonb
  );
  $$
);