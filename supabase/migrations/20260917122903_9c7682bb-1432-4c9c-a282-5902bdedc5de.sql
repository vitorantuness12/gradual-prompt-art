CREATE OR REPLACE FUNCTION public.set_my_default_address(_address_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.saved_addresses
    WHERE id = _address_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Endereço não encontrado.';
  END IF;

  UPDATE public.saved_addresses
  SET is_default = false, updated_at = now()
  WHERE user_id = auth.uid() AND is_default = true;

  UPDATE public.saved_addresses
  SET is_default = true, updated_at = now()
  WHERE id = _address_id AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_saved_address(_address_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _was_default boolean;
BEGIN
  SELECT is_default INTO _was_default
  FROM public.saved_addresses
  WHERE id = _address_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Endereço não encontrado.';
  END IF;

  DELETE FROM public.saved_addresses
  WHERE id = _address_id AND user_id = auth.uid();

  IF _was_default THEN
    UPDATE public.saved_addresses
    SET is_default = true, updated_at = now()
    WHERE id = (
      SELECT id FROM public.saved_addresses
      WHERE user_id = auth.uid()
      ORDER BY created_at ASC
      LIMIT 1
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_default_address(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_default_address(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_my_saved_address(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_saved_address(uuid) TO authenticated, service_role;