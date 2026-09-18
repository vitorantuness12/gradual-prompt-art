CREATE OR REPLACE FUNCTION public.courier_has_approved_store(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT _user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.store_couriers sc
      WHERE sc.courier_user_id = auth.uid()
        AND sc.status = 'approved'
        AND (sc.blocked_until IS NULL OR sc.blocked_until <= now())
    );
$$;

REVOKE ALL ON FUNCTION public.courier_has_approved_store(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.courier_has_approved_store(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.courier_has_approved_store(uuid) TO service_role;