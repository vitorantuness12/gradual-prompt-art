ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS checkout_type text;

ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_checkout_type_check;

ALTER TABLE public.stores
  ADD CONSTRAINT stores_checkout_type_check
  CHECK (checkout_type IS NULL OR checkout_type IN ('delivery', 'digital', 'agendamento', 'loja'));

COMMENT ON COLUMN public.stores.checkout_type IS 'Modelo de checkout escolhido pelo lojista. NULL = decidido automaticamente pelo segmento.';