import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EntryPopupCard } from "@/components/painel/editor/EntryPopupCard";
import { HighlightCampaignEditor, type CampaignDraft } from "@/components/painel/editor/HighlightCampaignEditor";
import { HighlightsPopup } from "@/components/store/HighlightsPopup";
import { RepeatOrderModal } from "@/components/store/RepeatOrderModal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { selectCampaignProducts } from "@/lib/destaques";
import {
  draftConfigFor,
  editorEntryPopupsQuery,
  publishPopup,
  savePopupDraft,
  saveHighlightItems,
  settingsRowFor,
  upsertHighlightCampaign,
  type HighlightCampaignRow,
} from "@/lib/entry-popup-queries";
import {
  type EntryPopupConfig,
  type PopupKind,
  type RepeatPopupContent,
} from "@/lib/entry-popups";
import { publicStoreQuery } from "@/lib/store-queries";
import type { StoreThemeConfig } from "@/lib/store-theme";

/**
 * Aba "Janelas de entrada".
 *
 * Um card por janela, com pré-visualização usando os produtos e as cores
 * reais da loja — sempre marcada como pré-visualização e sem gravar nada
 * no carrinho do cliente.
 */
interface Props {
  storeId: string;
  storeSlug: string;
  /** Tema em edição, para a prévia usar as cores atuais. */
  theme: StoreThemeConfig;
}

function newCampaign(storeId: string): HighlightCampaignRow {
  const now = new Date().toISOString();
  return {
    id: "",
    store_id: storeId,
    name: "Campanha de destaques",
    title: "Destaques para você",
    subtitle: "Selecionados especialmente da nossa loja",
    icon: null,
    header_color: null,
    text_color: null,
    selection_rule: "featured",
    category_id: null,
    max_items: 6,
    layout: "grid",
    show_original_price: true,
    badge: null,
    add_button_text: "Adicionar",
    starts_at: null,
    ends_at: null,
    is_active: true,
    sort_order: 0,
    created_at: now,
    updated_at: now,
  };
}

export function EntryPopupsTab({ storeId, storeSlug, theme }: Props) {
  const queryClient = useQueryClient();
  const query = useQuery(editorEntryPopupsQuery(storeId));
  const storeData = useQuery(publicStoreQuery(storeSlug));

  const [repeatConfig, setRepeatConfig] = useState<EntryPopupConfig | null>(null);
  const [highlightsConfig, setHighlightsConfig] = useState<EntryPopupConfig | null>(null);
  const [campaign, setCampaign] = useState<CampaignDraft | null>(null);
  const [preview, setPreview] = useState<PopupKind | null>(null);

  useEffect(() => {
    if (!query.data || repeatConfig) return;
    setRepeatConfig(draftConfigFor(query.data.settings, "repeat"));
    setHighlightsConfig(draftConfigFor(query.data.settings, "highlights"));
    const existing = query.data.campaigns[0] ?? null;
    setCampaign({
      campaign: existing ?? newCampaign(storeId),
      items: existing
        ? query.data.items
            .filter((item) => item.campaign_id === existing.id)
            .map((item) => ({ product_id: item.product_id, badge: item.badge, sort_order: item.sort_order }))
        : [],
    });
  }, [query.data, repeatConfig, storeId]);

  const save = useMutation({
    mutationFn: async ({ kind, publish }: { kind: PopupKind; publish: boolean }) => {
      const config = kind === "repeat" ? repeatConfig : highlightsConfig;
      if (!config) throw new Error("Configuração não carregada");

      let nextConfig = config;
      if (kind === "highlights" && campaign) {
        const saved = await upsertHighlightCampaign(storeId, campaign.campaign);
        await saveHighlightItems(storeId, saved.id, campaign.items);
        setCampaign({ ...campaign, campaign: saved });
        nextConfig = { ...config, campaignId: saved.id };
        setHighlightsConfig(nextConfig);
      }

      if (publish) {
        await publishPopup(storeId, kind, nextConfig, `Publicado em ${formatDateTime(new Date())}`);
      } else {
        await savePopupDraft(storeId, kind, nextConfig);
      }
    },
    onSuccess: (_data, variables) => {
      toast.success(
        variables.publish
          ? "Janela publicada. Seus clientes já veem a nova versão."
          : "Configuração salva em rascunho.",
      );
      void queryClient.invalidateQueries({ queryKey: ["entry-popups"] });
    },
    onError: () => toast.error("Não foi possível salvar a configuração agora."),
  });

  if (query.isLoading || !repeatConfig || !highlightsConfig || !campaign) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const products = storeData.data?.products ?? [];
  const previewItems = selectCampaignProducts(campaign.campaign, products, { manualItems: campaign.items });
  const repeatRow = settingsRowFor(query.data?.settings ?? [], "repeat");
  const highlightsRow = settingsRowFor(query.data?.settings ?? [], "highlights");

  const bothAuto =
    repeatConfig.enabled &&
    highlightsConfig.enabled &&
    repeatConfig.autoOpen &&
    highlightsConfig.autoOpen &&
    repeatConfig.priority === highlightsConfig.priority;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        As duas janelas são independentes: você pode ativar uma, as duas ou nenhuma. Nunca aparecem duas ao mesmo
        tempo — quem abre primeiro é definido pela ordem de prioridade.
      </p>

      {bothAuto ? (
        <Alert>
          <AlertDescription>
            As duas janelas estão com a mesma ordem de prioridade. Defina uma para aparecer primeiro.
          </AlertDescription>
        </Alert>
      ) : null}

      <EntryPopupCard
        kind="repeat"
        title="Repetir último pedido"
        description="O cliente informa o telefone e recebe os itens do último pedido na sacola."
        config={repeatConfig}
        onChange={setRepeatConfig}
        onSave={() => save.mutate({ kind: "repeat", publish: false })}
        onPublish={() => save.mutate({ kind: "repeat", publish: true })}
        onPreview={() => setPreview("repeat")}
        saving={save.isPending}
        publishing={save.isPending}
        hasUnpublished={Boolean(repeatRow?.has_unpublished_changes)}
      />

      <EntryPopupCard
        kind="highlights"
        title="Destaques para você"
        description="Uma vitrine curta com produtos escolhidos por você ou pela regra automática."
        config={highlightsConfig}
        onChange={setHighlightsConfig}
        onSave={() => save.mutate({ kind: "highlights", publish: false })}
        onPublish={() => save.mutate({ kind: "highlights", publish: true })}
        onPreview={() => setPreview("highlights")}
        saving={save.isPending}
        publishing={save.isPending}
        hasUnpublished={Boolean(highlightsRow?.has_unpublished_changes)}
      >
        <HighlightCampaignEditor
          draft={campaign}
          onChange={setCampaign}
          products={products.map((product) => ({ id: product.id, name: product.name }))}
          categories={(storeData.data?.categories ?? []).map((category) => ({
            id: category.id,
            name: category.name,
          }))}
        />
        {previewItems.length === 0 ? (
          <Alert>
            <AlertDescription>
              Nenhum produto elegível com a regra atual. A janela não abrirá automaticamente até existir item
              disponível.
            </AlertDescription>
          </Alert>
        ) : null}
      </EntryPopupCard>

      {/* Prévia com as cores e produtos reais da loja. */}
        <RepeatOrderModal
          slug={storeSlug}
          products={products}
          groups={storeData.data?.optionGroups ?? []}
          options={storeData.data?.options ?? []}
          content={repeatConfig.content as RepeatPopupContent}
          open={preview === "repeat"}
          onOpenChange={(open) => setPreview(open ? "repeat" : null)}
          onAddLines={() => undefined}
          onDismissForever={() => undefined}
          theme={theme}
          preview
        />
        <HighlightsPopup
          campaign={campaign.campaign}
          items={previewItems}
          open={preview === "highlights"}
          onOpenChange={(open) => setPreview(open ? "highlights" : null)}
          onAdd={() => undefined}
          onOpenDetail={() => undefined}
          theme={theme}
          preview
        />
    </div>
  );
}
