import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PlatformLogoField } from "@/components/admin/PlatformLogoField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createPlatformLogoUpload, savePlatformBranding } from "@/lib/platform-branding.functions";
import { EMPTY_PLATFORM_BRANDING, fetchPlatformBranding, platformBrandingQueryKey, type PlatformBranding } from "@/lib/platform-branding";

export function PlatformBrandingTab() {
  const queryClient = useQueryClient();
  const prepareUpload = useServerFn(createPlatformLogoUpload);
  const saveBranding = useServerFn(savePlatformBranding);
  const query = useQuery({ queryKey: platformBrandingQueryKey, queryFn: fetchPlatformBranding });
  const [draft, setDraft] = useState<PlatformBranding>(EMPTY_PLATFORM_BRANDING);

  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  const dirty = useMemo(() => {
    if (!query.data) return false;
    return ["salesLogoLightUrl", "salesLogoDarkUrl", "merchantLogoLightUrl", "merchantLogoDarkUrl", "faviconUrl", "appCoverUrl", "pwaIconUrl", "pwaMaskableIconUrl", "pwaSplashUrl"].some(
      (key) => draft[key as keyof PlatformBranding] !== query.data[key as keyof PlatformBranding],
    );
  }, [draft, query.data]);

  const save = useMutation({
    mutationFn: () => saveBranding({ data: {
      salesLogoLightUrl: draft.salesLogoLightUrl,
      salesLogoDarkUrl: draft.salesLogoDarkUrl,
      merchantLogoLightUrl: draft.merchantLogoLightUrl,
      merchantLogoDarkUrl: draft.merchantLogoDarkUrl,
      faviconUrl: draft.faviconUrl,
      appCoverUrl: draft.appCoverUrl,
      pwaIconUrl: draft.pwaIconUrl,
      pwaMaskableIconUrl: draft.pwaMaskableIconUrl,
      pwaSplashUrl: draft.pwaSplashUrl,
    } }),
    onSuccess: () => {
      toast.success("Identidade visual atualizada.");
      void queryClient.invalidateQueries({ queryKey: platformBrandingQueryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading) return <Skeleton className="h-96 rounded-lg" />;

  const set = (key: keyof PlatformBranding, value: string | null) => setDraft((current) => ({ ...current, [key]: value }));
  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Identidade visual</CardTitle>
          <CardDescription className="mt-2 max-w-2xl">Use logos distintas na página de vendas e na área do lojista. Formatos: PNG, JPG, WebP ou SVG, até 5 MB.</CardDescription>
        </div>
        <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          <Save /> {save.isPending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {dirty ? <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">Existem alterações ainda não salvas.</p> : null}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Página de vendas</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <PlatformLogoField title="Logo para modo claro" description="Cabeçalho e rodapé sobre fundos claros." slot="sales_logo_light_url" value={draft.salesLogoLightUrl} darkPreview={false} prepareUpload={prepareUpload} onChange={(value) => set("salesLogoLightUrl", value)} />
            <PlatformLogoField title="Logo para modo escuro" description="Cabeçalho e rodapé sobre fundos escuros." slot="sales_logo_dark_url" value={draft.salesLogoDarkUrl} darkPreview prepareUpload={prepareUpload} onChange={(value) => set("salesLogoDarkUrl", value)} />
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Aplicativo e navegador</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <PlatformLogoField title="Favicon" description="Ícone quadrado exibido na aba do navegador e nos favoritos. Recomendado: 512 × 512 px." slot="favicon_url" value={draft.faviconUrl} darkPreview={false} previewShape="square" successLabel="Favicon" prepareUpload={prepareUpload} onChange={(value) => set("faviconUrl", value)} />
            <PlatformLogoField title="Capa do aplicativo" description="Imagem horizontal usada na abertura e no compartilhamento do aplicativo. Recomendado: 1200 × 630 px." slot="app_cover_url" value={draft.appCoverUrl} darkPreview={false} previewShape="cover" successLabel="Capa" prepareUpload={prepareUpload} onChange={(value) => set("appCoverUrl", value)} />
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Aplicativo PWA</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <PlatformLogoField title="Ícone do aplicativo" description="Ícone quadrado exibido ao instalar o aplicativo. Recomendado: 512 × 512 px." slot="pwa_icon_url" value={draft.pwaIconUrl} darkPreview={false} previewShape="square" successLabel="Ícone" prepareUpload={prepareUpload} onChange={(value) => set("pwaIconUrl", value)} />
            <PlatformLogoField title="Ícone adaptável" description="Mantenha a marca no centro, com espaço livre nas bordas para o recorte do celular." slot="pwa_maskable_icon_url" value={draft.pwaMaskableIconUrl} darkPreview={false} previewShape="square" successLabel="Ícone adaptável" prepareUpload={prepareUpload} onChange={(value) => set("pwaMaskableIconUrl", value)} />
            <PlatformLogoField title="Tela de abertura" description="Imagem de apresentação do aplicativo. Recomendado: formato vertical, até 1920 px." slot="pwa_splash_url" value={draft.pwaSplashUrl} darkPreview={false} previewShape="splash" successLabel="Tela de abertura" prepareUpload={prepareUpload} onChange={(value) => set("pwaSplashUrl", value)} />
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Área do lojista</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <PlatformLogoField title="Logo para modo claro" description="Painel e telas internas em aparência clara." slot="merchant_logo_light_url" value={draft.merchantLogoLightUrl} darkPreview={false} prepareUpload={prepareUpload} onChange={(value) => set("merchantLogoLightUrl", value)} />
            <PlatformLogoField title="Logo para modo escuro" description="Painel e telas internas em aparência escura." slot="merchant_logo_dark_url" value={draft.merchantLogoDarkUrl} darkPreview prepareUpload={prepareUpload} onChange={(value) => set("merchantLogoDarkUrl", value)} />
          </div>
        </section>
      </CardContent>
    </Card>
  );
}