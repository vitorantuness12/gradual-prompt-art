import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";

import { supabase } from "@/integrations/supabase/client";
import { defaultPosKdsSettings, parsePosKdsSettings, type PosKdsSettings } from "@/lib/pos-kds";

/**
 * Configurações do PDV e do KDS.
 *
 * Existem dois níveis: o da loja (padrão para todo mundo) e o do
 * usuário/terminal, que sobrescreve o da loja quando o operador ajusta algo só
 * para a estação dele.
 */

export type SettingsScope = "store" | "terminal";

interface SettingsRow {
  id: string;
  scope: string;
  terminal: string;
  user_id: string | null;
  settings: unknown;
}

export interface PosKdsSettingsState {
  settings: PosKdsSettings;
  storeSettings: PosKdsSettings;
  isLoading: boolean;
  hasTerminalOverride: boolean;
  save: (patch: Partial<PosKdsSettings>, scope?: SettingsScope) => void;
  resetTerminal: () => void;
  isSaving: boolean;
}

export function usePosKdsSettings(storeId: string | undefined, terminal: string): PosKdsSettingsState {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["pos-kds-settings", storeId],
    enabled: Boolean(storeId),
    queryFn: async (): Promise<SettingsRow[]> => {
      const { data, error } = await supabase
        .from("pos_kds_settings")
        .select("id, scope, terminal, user_id, settings")
        .eq("store_id", storeId!);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const rows = query.data ?? [];
  const storeRow = rows.find((row) => row.scope === "store");
  const terminalRow = rows.find((row) => row.scope === "terminal" && row.terminal === terminal);

  const storeSettings = useMemo(
    () => (storeRow ? parsePosKdsSettings(storeRow.settings) : defaultPosKdsSettings()),
    [storeRow],
  );

  const settings = useMemo(() => {
    if (!terminalRow) return storeSettings;
    const raw = (terminalRow.settings ?? {}) as Record<string, unknown>;
    // O terminal só sobrescreve o que ele mesmo definiu.
    return parsePosKdsSettings({ ...(storeRow?.settings as Record<string, unknown> | undefined), ...raw });
  }, [terminalRow, storeRow, storeSettings]);

  const mutation = useMutation({
    mutationFn: async (input: { patch: Partial<PosKdsSettings>; scope: SettingsScope }) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id ?? null;
      const isTerminal = input.scope === "terminal";
      const current = isTerminal ? ((terminalRow?.settings ?? {}) as Record<string, unknown>) : (storeRow?.settings ?? {});
      const merged = { ...(current as Record<string, unknown>), ...input.patch };
      const row = isTerminal ? terminalRow : storeRow;

      if (row) {
        const { error } = await supabase.from("pos_kds_settings").update({ settings: merged }).eq("id", row.id);
        if (error) throw new Error(error.message);
        return;
      }
      const { error } = await supabase.from("pos_kds_settings").insert({
        store_id: storeId!,
        scope: input.scope,
        terminal: isTerminal ? terminal : "",
        user_id: isTerminal ? userId : null,
        settings: merged,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos-kds-settings", storeId] }),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      if (!terminalRow) return;
      const { error } = await supabase.from("pos_kds_settings").update({ settings: {} }).eq("id", terminalRow.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos-kds-settings", storeId] }),
  });

  const save = useCallback(
    (patch: Partial<PosKdsSettings>, scope: SettingsScope = "store") => {
      if (!storeId) return;
      mutation.mutate({ patch, scope });
    },
    [mutation, storeId],
  );

  return {
    settings,
    storeSettings,
    isLoading: query.isLoading,
    hasTerminalOverride: Boolean(terminalRow && Object.keys((terminalRow.settings ?? {}) as object).length > 0),
    save,
    resetTerminal: () => resetMutation.mutate(),
    isSaving: mutation.isPending || resetMutation.isPending,
  };
}
