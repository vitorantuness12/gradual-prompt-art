-- Bucket store-images: usado por logo, capa e fotos de produto.
-- O app faz upload via cliente (RLS público de INSERT) e gera uma URL assinada de 5 anos.

INSERT INTO storage.buckets (id, name, public)
VALUES ('store-images', 'store-images', false)
ON CONFLICT (id) DO NOTHING;

-- Política de INSERT aberta para usuários autenticados (e anônimos como fallback)
DROP POLICY IF EXISTS "store_images_upload" ON storage.objects;
CREATE POLICY "store_images_upload"
  ON storage.objects
  FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'store-images');

-- Política de SELECT restrita ao dono da loja (a pasta é sempre {store_id}/...)
DROP POLICY IF EXISTS "store_images_select_owners" ON storage.objects;
CREATE POLICY "store_images_select_owners"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'store-images'
    AND EXISTS (
      SELECT 1
      FROM stores s
      WHERE s.id::text = split_part(name, '/', 1)
        AND (
          s.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM store_members sm
            WHERE sm.store_id = s.id
              AND sm.user_id = auth.uid()
              AND sm.is_active = true
          )
        )
    )
  );

-- UPDATE e DELETE só para o dono da loja
DROP POLICY IF EXISTS "store_images_modify_owners" ON storage.objects;
CREATE POLICY "store_images_modify_owners"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'store-images'
    AND EXISTS (
      SELECT 1
      FROM stores s
      WHERE s.id::text = split_part(name, '/', 1)
        AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'store-images'
    AND EXISTS (
      SELECT 1
      FROM stores s
      WHERE s.id::text = split_part(name, '/', 1)
        AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "store_images_delete_owners" ON storage.objects;
CREATE POLICY "store_images_delete_owners"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'store-images'
    AND EXISTS (
      SELECT 1
      FROM stores s
      WHERE s.id::text = split_part(name, '/', 1)
        AND s.owner_id = auth.uid()
    )
  );
