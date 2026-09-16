ALTER TABLE public.platform_branding
  ADD COLUMN IF NOT EXISTS favicon_url text,
  ADD COLUMN IF NOT EXISTS app_cover_url text;

COMMENT ON COLUMN public.platform_branding.favicon_url IS 'Ícone global exibido no navegador e atalhos da plataforma.';
COMMENT ON COLUMN public.platform_branding.app_cover_url IS 'Capa global usada nas experiências de instalação e apresentação do aplicativo.';