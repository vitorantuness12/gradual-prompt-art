CREATE POLICY "Equipe da loja envia materiais digitais"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'produtos-digitais' AND public.is_store_staff((storage.foldername(name))[1]::uuid, auth.uid()));

CREATE POLICY "Equipe da loja ve materiais digitais"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'produtos-digitais' AND public.is_store_staff((storage.foldername(name))[1]::uuid, auth.uid()));

CREATE POLICY "Equipe da loja remove materiais digitais"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'produtos-digitais' AND public.is_store_staff((storage.foldername(name))[1]::uuid, auth.uid()));