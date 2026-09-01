GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_features TO authenticated;
GRANT ALL ON public.store_features TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_sections TO authenticated;
GRANT SELECT ON public.store_sections TO anon;
GRANT ALL ON public.store_sections TO service_role;