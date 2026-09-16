CREATE TABLE public.platform_branding (
  key text PRIMARY KEY DEFAULT 'default',
  sales_logo_light_url text,
  sales_logo_dark_url text,
  merchant_logo_light_url text,
  merchant_logo_dark_url text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_branding_singleton_key CHECK (key = 'default')
);

GRANT SELECT ON public.platform_branding TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.platform_branding TO authenticated;
GRANT ALL ON public.platform_branding TO service_role;

ALTER TABLE public.platform_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform branding is publicly readable"
ON public.platform_branding
FOR SELECT
TO anon, authenticated
USING (key = 'default');

CREATE POLICY "Super admins manage platform branding"
ON public.platform_branding
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE TRIGGER platform_branding_set_updated_at
BEFORE UPDATE ON public.platform_branding
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Super admins upload platform branding"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'store-images'
  AND (storage.foldername(name))[1] = 'platform-branding'
  AND public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

CREATE POLICY "Super admins update platform branding"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'store-images'
  AND (storage.foldername(name))[1] = 'platform-branding'
  AND public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'store-images'
  AND (storage.foldername(name))[1] = 'platform-branding'
  AND public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

CREATE POLICY "Super admins delete platform branding"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'store-images'
  AND (storage.foldername(name))[1] = 'platform-branding'
  AND public.has_role(auth.uid(), 'super_admin'::public.app_role)
);