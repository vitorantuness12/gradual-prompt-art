CREATE POLICY "Super admins read platform assets"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'platform-assets'
  AND public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

CREATE POLICY "Super admins upload platform assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'platform-assets'
  AND public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

CREATE POLICY "Super admins update platform assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'platform-assets'
  AND public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'platform-assets'
  AND public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

CREATE POLICY "Super admins delete platform assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'platform-assets'
  AND public.has_role(auth.uid(), 'super_admin'::public.app_role)
);