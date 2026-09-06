CREATE TABLE public.affiliate_payouts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  affiliate_id uuid NOT NULL REFERENCES public.store_affiliates(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'pix',
  reference text,
  notes text,
  period_start date,
  period_end date,
  paid_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX affiliate_payouts_store_idx ON public.affiliate_payouts (store_id, paid_at DESC);
CREATE INDEX affiliate_payouts_affiliate_idx ON public.affiliate_payouts (affiliate_id, paid_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_payouts TO authenticated;
GRANT ALL ON public.affiliate_payouts TO service_role;

ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe da loja gerencia pagamentos de comissao"
ON public.affiliate_payouts
FOR ALL
TO authenticated
USING (public.is_store_staff(store_id, auth.uid()))
WITH CHECK (public.is_store_staff(store_id, auth.uid()));

CREATE TRIGGER set_affiliate_payouts_updated_at
BEFORE UPDATE ON public.affiliate_payouts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();