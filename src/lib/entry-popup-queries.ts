/**
 * Acesso às janelas de entrada no banco.
 *
 * - Lado público (cliente): lê somente a configuração publicada e campanhas
 *   ativas, via políticas de anon. O rascunho nunca sai do painel.
 * - Lado do lojista: lê e grava rascunhos, publica versões e gerencia
 *   campanhas, sempre preso ao store_id pelas políticas de membro.
 */
import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  defaultEntryPopupConfig,
  parseEntryPopupConfig,
  type EntryPopupConfig,
  type PopupKind,
} from "@/lib/entry-popups";

export type EntryPopupSettingsRow = Database["public"]["Tables"]["store_entry_popup_settings"]["Row"];
export type HighlightCampaignRow = Database["public"]["Tables"]["store_highlight_campaigns"]["Row"];
export type HighlightItemRow = Database["public"]["Tables"]["store_highlight_items"]["Row"];

export interface PublishedPopup {
  kind: PopupKind;
  config: EntryPopupConfig;
  version: number;
}

export interface PublicEntryPopups {
  popups: PublishedPopup[];
  campaigns: HighlightCampaignRow[];
  items: HighlightItemRow[];
}

/** Configuração publicada das janelas — é o que o cliente da loja recebe. */
export function publicEntryPopupsQuery(storeId: string | null) {
  return queryOptions({
    queryKey: ["entry-popups", "public", storeId],
    enabled: Boolean(storeId),
    staleTime: 60_000,
    queryFn: async (): Promise<PublicEntryPopups> => {
      const [settings, campaigns] = await Promise.all([
        supabase
          .from("store_entry_popup_settings")
          .select("store_id, popup_kind, published_config, version")
          .eq("store_id", storeId!),
        supabase
          .from("store_highlight_campaigns")
          .select("*")
          .eq("store_id", storeId!)
          .eq("is_active", true)
          .order("sort_order"),
      ]);

      const campaignRows = campaigns.data ?? [];
      const campaignIds = campaignRows.map((campaign) => campaign.id);
      const items = campaignIds.length
        ? await supabase
            .from("store_highlight_items")
            .select("*")
            .in("campaign_id", campaignIds)
            .order("sort_order")
        : { data: [] as HighlightItemRow[] };

      const popups: PublishedPopup[] = (settings.data ?? [])
        .filter((row) => row.published_config !== null)
        .map((row) => ({
          kind: row.popup_kind as PopupKind,
          config: parseEntryPopupConfig(row.popup_kind as PopupKind, row.published_config),
          version: row.version,
        }));

      return { popups, campaigns: campaignRows, items: items.data ?? [] };
    },
  });
}

/** Dados completos para o editor do lojista (rascunho + publicado). */
export function editorEntryPopupsQuery(storeId: string | null) {
  return queryOptions({
    queryKey: ["entry-popups", "editor", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const [settings, campaigns] = await Promise.all([
        supabase.from("store_entry_popup_settings").select("*").eq("store_id", storeId!),
        supabase
          .from("store_highlight_campaigns")
          .select("*")
          .eq("store_id", storeId!)
          .order("sort_order"),
      ]);

      const campaignRows = campaigns.data ?? [];
      const campaignIds = campaignRows.map((campaign) => campaign.id);
      const items = campaignIds.length
        ? await supabase
            .from("store_highlight_items")
            .select("*")
            .in("campaign_id", campaignIds)
            .order("sort_order")
        : { data: [] as HighlightItemRow[] };

      return {
        settings: settings.data ?? [],
        campaigns: campaignRows,
        items: items.data ?? [],
      };
    },
  });
}

/** Rascunho atual de cada janela (ou o padrão quando nunca foi configurada). */
export function draftConfigFor(rows: EntryPopupSettingsRow[], kind: PopupKind): EntryPopupConfig {
  const row = rows.find((item) => item.popup_kind === kind);
  if (!row) return defaultEntryPopupConfig(kind);
  return parseEntryPopupConfig(kind, row.draft_config);
}

export function settingsRowFor(rows: EntryPopupSettingsRow[], kind: PopupKind) {
  return rows.find((item) => item.popup_kind === kind) ?? null;
}

/** Salva o rascunho sem afetar o que o cliente vê. */
export async function savePopupDraft(storeId: string, kind: PopupKind, config: EntryPopupConfig) {
  const { error } = await supabase.from("store_entry_popup_settings").upsert(
    {
      store_id: storeId,
      popup_kind: kind,
      draft_config: config as never,
      has_unpublished_changes: true,
    },
    { onConflict: "store_id,popup_kind" },
  );
  if (error) throw new Error(error.message);
}

/** Publica o rascunho: clientes passam a ver a nova versão. */
export async function publishPopup(storeId: string, kind: PopupKind, config: EntryPopupConfig, label: string) {
  const existing = settingsRowFor(
    (await supabase.from("store_entry_popup_settings").select("*").eq("store_id", storeId)).data ?? [],
    kind,
  );
  const nextVersion = (existing?.version ?? 0) + 1;

  const { error } = await supabase.from("store_entry_popup_settings").upsert(
    {
      store_id: storeId,
      popup_kind: kind,
      draft_config: config as never,
      published_config: config as never,
      has_unpublished_changes: false,
      version: nextVersion,
      published_at: new Date().toISOString(),
    },
    { onConflict: "store_id,popup_kind" },
  );
  if (error) throw new Error(error.message);

  await supabase.from("store_entry_popup_versions").insert({
    store_id: storeId,
    popup_kind: kind,
    label,
    config: config as never,
  });
}

/** Cria (ou atualiza) a campanha de destaques da loja. */
export async function upsertHighlightCampaign(
  storeId: string,
  campaign: Partial<HighlightCampaignRow> & { store_id?: string },
): Promise<HighlightCampaignRow> {
  const payload = { ...campaign, store_id: storeId };
  const { data, error } = campaign.id
    ? await supabase.from("store_highlight_campaigns").update(payload).eq("id", campaign.id).select().single()
    : await supabase.from("store_highlight_campaigns").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data;
}

/** Substitui a seleção manual de produtos da campanha. */
export async function saveHighlightItems(
  storeId: string,
  campaignId: string,
  items: { product_id: string; badge: string | null; sort_order: number }[],
) {
  const { error: removeError } = await supabase
    .from("store_highlight_items")
    .delete()
    .eq("campaign_id", campaignId);
  if (removeError) throw new Error(removeError.message);
  if (items.length === 0) return;
  const { error } = await supabase.from("store_highlight_items").insert(
    items.map((item) => ({ ...item, store_id: storeId, campaign_id: campaignId })),
  );
  if (error) throw new Error(error.message);
}
