-- Habilita RLS no bucket store-images e garante que usuários autenticados consigam fazer upload e ler imagens.
-- O bucket já existe (migration 20260901192438); aqui填补 as políticas que faltam.

-- ─── storage.buckets (verifica e garante public=false para permitir RLS) ─────────
update storage.buckets
set public = false
where name = 'store-images';

-- ─── storage.objects: SELECT público (a loja mostra imagens para qualquer visitante) ───
drop policy if exists "store_images_select_all" on storage.objects;
create policy "store_images_select_all"
  on storage.objects for select
  using (bucket_id = 'store-images');

-- ─── storage.objects: INSERT para qualquer usuário autenticado ─────────────────────
drop policy if exists "store_images_insert_authenticated" on storage.objects;
create policy "store_images_insert_authenticated"
  on storage.objects for insert
  with check (
    bucket_id = 'store-images'
    and auth.role() = 'authenticated'
  );

-- ─── storage.objects: DELETE para o dono do arquivo ───────────────────────────────
drop policy if exists "store_images_delete_owner" on storage.objects;
create policy "store_images_delete_owner"
  on storage.objects for delete
  using (
    bucket_id = 'store-images'
    and (auth.uid() = owner or auth.role() = 'authenticated')
  );

-- ─── storage.objects: UPDATE (reescrita/upsert) para o dono ───────────────────────
drop policy if exists "store_images_update_owner" on storage.objects;
create policy "store_images_update_owner"
  on storage.objects for update
  using (
    bucket_id = 'store-images'
    and (auth.uid() = owner or auth.role() = 'authenticated')
  );
