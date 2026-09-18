ALTER TABLE public.store_couriers
  ADD COLUMN IF NOT EXISTS invite_data jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.store_couriers.invite_data IS 'Dados operacionais mínimos informados pela loja e aplicados ao perfil após a ativação do convite.';