DROP POLICY IF EXISTS "Public reads published store images" ON storage.objects;
DROP POLICY IF EXISTS "Store managers read own images" ON storage.objects;
DROP POLICY IF EXISTS "Store managers upload own images" ON storage.objects;
DROP POLICY IF EXISTS "Store managers update own images" ON storage.objects;
DROP POLICY IF EXISTS "Store managers delete own images" ON storage.objects;

CREATE POLICY "Public reads published store images"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'store-images'
  AND EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id::text = (storage.foldername(storage.objects.name))[1]
      AND s.is_active = true
      AND s.is_published = true
  )
);

CREATE POLICY "Store managers read own images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'store-images'
  AND EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id::text = (storage.foldername(storage.objects.name))[1]
      AND public.has_store_permission(s.id, auth.uid(), 'settings')
  )
);

CREATE POLICY "Store managers upload own images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'store-images'
  AND EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id::text = (storage.foldername(storage.objects.name))[1]
      AND public.has_store_permission(s.id, auth.uid(), 'settings')
  )
);

CREATE POLICY "Store managers update own images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'store-images'
  AND EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id::text = (storage.foldername(storage.objects.name))[1]
      AND public.has_store_permission(s.id, auth.uid(), 'settings')
  )
)
WITH CHECK (
  bucket_id = 'store-images'
  AND EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id::text = (storage.foldername(storage.objects.name))[1]
      AND public.has_store_permission(s.id, auth.uid(), 'settings')
  )
);

CREATE POLICY "Store managers delete own images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'store-images'
  AND EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id::text = (storage.foldername(storage.objects.name))[1]
      AND public.has_store_permission(s.id, auth.uid(), 'settings')
  )
);