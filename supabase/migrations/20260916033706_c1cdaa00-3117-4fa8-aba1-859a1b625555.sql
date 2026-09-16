ALTER TABLE public.platform_branding
  ADD COLUMN IF NOT EXISTS pwa_icon_url text,
  ADD COLUMN IF NOT EXISTS pwa_maskable_icon_url text,
  ADD COLUMN IF NOT EXISTS pwa_splash_url text;

COMMENT ON COLUMN public.platform_branding.pwa_icon_url IS 'Ícone quadrado principal usado na instalação do aplicativo PWA.';
COMMENT ON COLUMN public.platform_branding.pwa_maskable_icon_url IS 'Ícone adaptável com área segura usado por dispositivos compatíveis.';
COMMENT ON COLUMN public.platform_branding.pwa_splash_url IS 'Imagem de apresentação do aplicativo PWA usada na experiência de instalação e abertura.';