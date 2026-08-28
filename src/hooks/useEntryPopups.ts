import { useEffect, useMemo, useRef, useState } from "react";

import {
  detectDevice,
  isPopupHiddenForever,
  markPopupHidden,
  markPopupShown,
  planEntryPopups,
  MemoryStorage,
  popupKeys,
  type EntryPopupConfig,
  type PopupKind,
  type PlannedPopup,
} from "@/lib/entry-popups";
import type { PublishedPopup } from "@/lib/entry-popup-queries";

/**
 * Orquestrador das janelas de entrada da loja pública.
 *
 * Garante que só uma janela apareça por vez, respeita a prioridade e o modo
 * escolhidos pelo lojista e nunca reabre em cada atualização de página.
 * Qualquer falha aqui simplesmente não abre janela — a loja continua
 * navegável.
 */
function safeLocal() {
  if (typeof window === "undefined") return new MemoryStorage();
  try {
    window.localStorage.getItem("__test");
    return window.localStorage;
  } catch {
    return new MemoryStorage();
  }
}

function safeSession() {
  if (typeof window === "undefined") return new MemoryStorage();
  try {
    window.sessionStorage.getItem("__test");
    return window.sessionStorage;
  } catch {
    return new MemoryStorage();
  }
}

/** Identificador anônimo do navegador, usado para salvar a preferência. */
export function browserKey(): string {
  const store = safeLocal();
  const existing = store.getItem(popupKeys.browserKey);
  if (existing) return existing;
  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `k-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  store.setItem(popupKeys.browserKey, generated);
  return generated;
}

interface Options {
  slug: string;
  popups: PublishedPopup[];
  /** Cada janela informa se tem conteúdo para mostrar agora. */
  readiness: Record<PopupKind, boolean>;
  hasActiveCampaign: boolean;
  /** Só avalia quando os dados da loja já chegaram. */
  ready: boolean;
}

export interface EntryPopupsState {
  /** Janela aberta agora (nunca duas ao mesmo tempo). */
  current: PopupKind | null;
  configFor: (kind: PopupKind) => EntryPopupConfig | null;
  versionFor: (kind: PopupKind) => number;
  /** Abertura manual pelo cliente (botão no cabeçalho). */
  openManually: (kind: PopupKind) => void;
  /** Fecha e, no modo sequencial, deixa a próxima janela aparecer. */
  close: (kind: PopupKind) => void;
  dismissForever: (kind: PopupKind) => void;
  /** O botão manual é escondido quando o cliente pediu para não ver mais. */
  isHidden: (kind: PopupKind) => boolean;
}

export function useEntryPopups({ slug, popups, readiness, hasActiveCampaign, ready }: Options): EntryPopupsState {
  const [current, setCurrent] = useState<PopupKind | null>(null);
  const [queue, setQueue] = useState<PopupKind[]>([]);
  const [hiddenTick, setHiddenTick] = useState(0);
  const evaluated = useRef(false);

  const configFor = (kind: PopupKind) => popups.find((popup) => popup.kind === kind)?.config ?? null;
  const versionFor = (kind: PopupKind) => popups.find((popup) => popup.kind === kind)?.version ?? 0;

  const planned = useMemo<PlannedPopup[]>(() => {
    if (!ready || typeof window === "undefined") return [];
    try {
      const candidates: PlannedPopup[] = popups
        .filter((popup) => readiness[popup.kind])
        .map((popup) => ({ kind: popup.kind, config: popup.config, version: popup.version }));
      return planEntryPopups(candidates, {
        slug,
        now: new Date(),
        device: detectDevice(window.innerWidth),
        hasActiveCampaign,
        local: safeLocal(),
        session: safeSession(),
      });
    } catch {
      return [];
    }
  }, [ready, popups, readiness, slug, hasActiveCampaign]);

  // Avalia uma única vez por carregamento, quando os dados já chegaram.
  useEffect(() => {
    if (!ready || evaluated.current || planned.length === 0) return;
    evaluated.current = true;
    const [first, ...rest] = planned;
    if (!first) return;
    markPopupShown(slug, first.kind, first.config, new Date(), safeLocal(), safeSession());
    setCurrent(first.kind);
    setQueue(first.config.multiMode === "sequential" ? rest.map((popup) => popup.kind) : []);
  }, [ready, planned, slug]);

  return {
    current,
    configFor,
    versionFor,
    openManually: (kind) => {
      setQueue([]);
      setCurrent(kind);
    },
    close: (kind) => {
      setCurrent(null);
      const [next, ...rest] = queue;
      if (next && next !== kind) {
        const config = configFor(next);
        if (config) {
          markPopupShown(slug, next, config, new Date(), safeLocal(), safeSession());
          setQueue(rest);
          // Pequeno intervalo para a animação de saída terminar.
          window.setTimeout(() => setCurrent(next), 320);
          return;
        }
      }
      setQueue([]);
    },
    dismissForever: (kind) => {
      markPopupHidden(slug, kind, versionFor(kind), safeLocal());
      setHiddenTick((tick) => tick + 1);
      setCurrent(null);
      setQueue([]);
    },
    isHidden: (kind) => {
      void hiddenTick;
      return isPopupHiddenForever(slug, kind, versionFor(kind), safeLocal());
    },
  };
}
