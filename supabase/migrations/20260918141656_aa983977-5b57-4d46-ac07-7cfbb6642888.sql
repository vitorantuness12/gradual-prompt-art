ALTER TABLE public.store_couriers
  ADD COLUMN IF NOT EXISTS invited_by uuid,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS invitation_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS status_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS store_couriers_store_user_unique
  ON public.store_couriers (store_id, courier_user_id)
  WHERE courier_user_id IS NOT NULL AND status <> 'removed';

CREATE UNIQUE INDEX IF NOT EXISTS store_couriers_store_email_invite_unique
  ON public.store_couriers (store_id, lower(invite_email))
  WHERE courier_user_id IS NULL AND invite_email IS NOT NULL AND status IN ('invited', 'pending');

CREATE INDEX IF NOT EXISTS store_couriers_invite_token_idx
  ON public.store_couriers (invite_token)
  WHERE invite_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS store_couriers_courier_status_idx
  ON public.store_couriers (courier_user_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_couriers TO authenticated;
GRANT ALL ON public.store_couriers TO service_role;

DROP POLICY IF EXISTS store_couriers_courier_update ON public.store_couriers;
CREATE POLICY store_couriers_courier_accept_invite
  ON public.store_couriers
  FOR UPDATE
  TO authenticated
  USING (courier_user_id = auth.uid() AND status IN ('invited', 'pending'))
  WITH CHECK (courier_user_id = auth.uid() AND status IN ('approved', 'removed'));

CREATE OR REPLACE FUNCTION public.courier_has_approved_store(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.store_couriers sc
    WHERE sc.courier_user_id = _user_id
      AND sc.status = 'approved'
      AND (sc.blocked_until IS NULL OR sc.blocked_until <= now())
  );
$$;

REVOKE ALL ON FUNCTION public.courier_has_approved_store(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.courier_has_approved_store(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.courier_has_approved_store(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.my_account_kinds()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'customer', EXISTS (SELECT 1 FROM public.customer_profiles WHERE user_id = auth.uid()),
    'courier', EXISTS (SELECT 1 FROM public.delivery_profiles WHERE user_id = auth.uid()),
    'courier_status', CASE
      WHEN public.courier_has_approved_store(auth.uid()) THEN 'approved'
      WHEN EXISTS (SELECT 1 FROM public.store_couriers WHERE courier_user_id = auth.uid() AND status IN ('invited','pending')) THEN 'awaiting_approval'
      ELSE (SELECT status::text FROM public.delivery_profiles WHERE user_id = auth.uid())
    END,
    'merchant', EXISTS (SELECT 1 FROM public.store_members WHERE user_id = auth.uid())
       OR EXISTS (SELECT 1 FROM public.merchant_profiles WHERE user_id = auth.uid()),
    'super_admin', public.has_role(auth.uid(),'super_admin')
  );
$$;

REVOKE ALL ON FUNCTION public.my_account_kinds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_account_kinds() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_account_kinds() TO service_role;