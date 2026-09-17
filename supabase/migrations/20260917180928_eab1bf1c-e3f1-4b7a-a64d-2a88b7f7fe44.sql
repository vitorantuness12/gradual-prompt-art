DROP POLICY IF EXISTS "store_images_upload" ON storage.objects;
DROP POLICY IF EXISTS "store_images_select_owners" ON storage.objects;
DROP POLICY IF EXISTS "store_images_modify_owners" ON storage.objects;
DROP POLICY IF EXISTS "store_images_delete_owners" ON storage.objects;
DROP POLICY IF EXISTS "store_images_select_all" ON storage.objects;
DROP POLICY IF EXISTS "store_images_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "store_images_delete_owner" ON storage.objects;
DROP POLICY IF EXISTS "store_images_update_owner" ON storage.objects;

CREATE POLICY "Public reads published store images"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'store-images'
  AND EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id::text = (storage.foldername(name))[1]
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
    WHERE s.id::text = (storage.foldername(name))[1]
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
    WHERE s.id::text = (storage.foldername(name))[1]
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
    WHERE s.id::text = (storage.foldername(name))[1]
      AND public.has_store_permission(s.id, auth.uid(), 'settings')
  )
)
WITH CHECK (
  bucket_id = 'store-images'
  AND EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id::text = (storage.foldername(name))[1]
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
    WHERE s.id::text = (storage.foldername(name))[1]
      AND public.has_store_permission(s.id, auth.uid(), 'settings')
  )
);