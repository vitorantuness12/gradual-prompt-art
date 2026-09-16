CREATE UNIQUE INDEX IF NOT EXISTS customer_profiles_phone_unique_idx
ON public.customer_profiles ((regexp_replace(phone, '\D', '', 'g')))
WHERE phone IS NOT NULL AND regexp_replace(phone, '\D', '', 'g') <> '';

CREATE UNIQUE INDEX IF NOT EXISTS saved_addresses_one_default_per_user_idx
ON public.saved_addresses (user_id)
WHERE is_default = true;

CREATE UNIQUE INDEX IF NOT EXISTS customers_store_user_unique_idx
ON public.customers (store_id, user_id)
WHERE user_id IS NOT NULL;

CREATE POLICY "Clientes veem seus enderecos da loja"
ON public.customer_addresses
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = customer_addresses.customer_id
      AND c.store_id = customer_addresses.store_id
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Clientes criam seus enderecos da loja"
ON public.customer_addresses
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = customer_addresses.customer_id
      AND c.store_id = customer_addresses.store_id
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Clientes atualizam seus enderecos da loja"
ON public.customer_addresses
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = customer_addresses.customer_id
      AND c.store_id = customer_addresses.store_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = customer_addresses.customer_id
      AND c.store_id = customer_addresses.store_id
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Clientes excluem seus enderecos da loja"
ON public.customer_addresses
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = customer_addresses.customer_id
      AND c.store_id = customer_addresses.store_id
      AND c.user_id = auth.uid()
  )
);