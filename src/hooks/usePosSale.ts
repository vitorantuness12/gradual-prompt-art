import { useCallback, useEffect, useMemo, useState } from "react";

import {
  cloneDraft,
  emptySaleDraft,
  isDraftDirty,
  lineUnitPrice,
  newDraftId,
  parseSaleDraft,
  saleTotals,
  type PosLineOption,
  type PosSaleDraft,
  type PosSaleLine,
  type PosSaleTotals,
  type SuspendedSale,
} from "@/lib/pos-sale";
import { unitPriceOf, type PosProductLike } from "@/lib/pos-kds";
import type { PosFulfillment } from "@/lib/pdv";

/**
 * Venda em andamento do PDV.
 *
 * O rascunho e as vendas suspensas ficam no armazenamento local por loja e
 * terminal, então sair do PDV pelo botão "X" (ou até recarregar a página) não
 * perde o carrinho. O dinheiro continua sendo recalculado no servidor.
 */

function draftKey(storeId: string, terminal: string): string {
  return `seu-pedido:pdv:venda:${storeId}:${terminal}`;
}

function suspendedKey(storeId: string, terminal: string): string {
  return `seu-pedido:pdv:suspensas:${storeId}:${terminal}`;
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Armazenamento cheio ou bloqueado: a venda segue em memória.
  }
}

export interface PosSaleState {
  draft: PosSaleDraft;
  totals: PosSaleTotals;
  suspended: SuspendedSale[];
  isDirty: boolean;
  hydrated: boolean;
  patch: (patch: Partial<PosSaleDraft>) => void;
  addProduct: (
    product: PosProductLike,
    options?: {
      quantity?: number;
      extras?: PosLineOption[];
      notes?: string;
      /** Peso/fração lançado pela balança ou digitado pelo operador. */
      weight?: number;
      unitLabel?: string;
      prescriptionInfo?: string;
    },
  ) => void;
  updateLine: (lineId: string, patch: Partial<PosSaleLine>) => void;
  changeQuantity: (lineId: string, delta: number) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  clear: () => void;
  newSale: () => void;
  suspend: (label?: string) => boolean;
  resume: (id: string) => void;
  discard: (id: string) => void;
  duplicate: () => void;
  setFulfillment: (value: PosFulfillment) => void;
}

export function usePosSale(storeId: string | undefined, terminal: string): PosSaleState {
  const [draft, setDraft] = useState<PosSaleDraft>(() => emptySaleDraft());
  const [suspended, setSuspended] = useState<SuspendedSale[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Leitura só no cliente: evita divergência entre servidor e navegador.
  useEffect(() => {
    if (!storeId) return;
    setHydrated(false);
    const storedDraft = parseSaleDraft(readJson(draftKey(storeId, terminal)));
    setDraft(storedDraft ?? emptySaleDraft());
    const storedSuspended = readJson<unknown[]>(suspendedKey(storeId, terminal)) ?? [];
    setSuspended(
      storedSuspended
        .map((item) => {
          const parsed = parseSaleDraft(item);
          if (!parsed) return null;
          const raw = item as { suspendedAt?: unknown };
          return {
            ...parsed,
            suspendedAt: typeof raw.suspendedAt === "string" ? raw.suspendedAt : parsed.createdAt,
          } satisfies SuspendedSale;
        })
        .filter((item): item is SuspendedSale => item !== null),
    );
    setHydrated(true);
  }, [storeId, terminal]);

  useEffect(() => {
    if (!storeId || !hydrated) return;
    writeJson(draftKey(storeId, terminal), draft);
  }, [draft, storeId, terminal, hydrated]);

  useEffect(() => {
    if (!storeId || !hydrated) return;
    writeJson(suspendedKey(storeId, terminal), suspended);
  }, [suspended, storeId, terminal, hydrated]);

  const totals = useMemo(() => saleTotals(draft), [draft]);

  const patch = useCallback((value: Partial<PosSaleDraft>) => {
    setDraft((current) => ({ ...current, ...value }));
  }, []);

  const addProduct = useCallback<PosSaleState["addProduct"]>((product, options) => {
    const byWeight = Boolean(options?.weight && options.weight > 0);
    const quantity = byWeight
      ? Math.round(Number(options?.weight) * 1000) / 1000
      : Math.max(1, Math.floor(options?.quantity ?? 1));
    const unitLabel = options?.unitLabel ?? (byWeight ? "kg" : "un");
    const prescriptionInfo = options?.prescriptionInfo ?? "";
    const extras = options?.extras ?? [];
    const notes = options?.notes ?? "";
    setDraft((current) => {
      // Sem adicionais nem observação, o mesmo produto apenas soma quantidade.
      const mergeable =
        extras.length === 0 && !notes && !byWeight && !prescriptionInfo
          ? current.lines.find((line) => line.productId === product.id && line.options.length === 0 && !line.notes)
          : undefined;
      if (mergeable) {
        return {
          ...current,
          lines: current.lines.map((line) =>
            line.lineId === mergeable.lineId ? { ...line, quantity: line.quantity + quantity } : line,
          ),
        };
      }
      const line: PosSaleLine = {
        lineId: `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productId: product.id,
        name: product.name,
        imageUrl: product.image_url ?? null,
        unitPrice: unitPriceOf(product),
        quantity,
        options: extras,
        notes,
        discount: 0,
        soldByWeight: byWeight,
        unitLabel,
        prescriptionInfo,
      };
      return { ...current, lines: [...current.lines, line] };
    });
  }, []);

  const updateLine = useCallback<PosSaleState["updateLine"]>((lineId, value) => {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => {
        if (line.lineId !== lineId) return line;
        const merged = { ...line, ...value };
        // O desconto do item nunca passa do valor bruto da linha.
        const quantity = merged.soldByWeight
          ? Math.max(0.001, Math.round(merged.quantity * 1000) / 1000)
          : Math.max(1, merged.quantity);
        const gross = lineUnitPrice(merged) * quantity;
        return { ...merged, quantity, discount: Math.min(Math.max(0, merged.discount), gross) };
      }),
    }));
  }, []);

  const changeQuantity = useCallback<PosSaleState["changeQuantity"]>((lineId, delta) => {
    setDraft((current) => ({
      ...current,
      lines: current.lines
        .map((line) => (line.lineId === lineId ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0),
    }));
  }, []);

  const setQuantity = useCallback<PosSaleState["setQuantity"]>((lineId, quantity) => {
    setDraft((current) => ({
      ...current,
      lines: current.lines
        .map((line) =>
          line.lineId === lineId
            ? { ...line, quantity: line.soldByWeight ? Math.round(quantity * 1000) / 1000 : Math.floor(quantity) }
            : line,
        )
        .filter((line) => line.quantity > 0),
    }));
  }, []);

  const removeLine = useCallback<PosSaleState["removeLine"]>((lineId) => {
    setDraft((current) => ({ ...current, lines: current.lines.filter((line) => line.lineId !== lineId) }));
  }, []);

  const clear = useCallback(() => {
    setDraft((current) => ({ ...emptySaleDraft(current.id), createdAt: current.createdAt }));
  }, []);

  const newSale = useCallback(() => setDraft(emptySaleDraft()), []);

  const suspend = useCallback<PosSaleState["suspend"]>((label) => {
    let suspendedOk = false;
    setDraft((current) => {
      if (!isDraftDirty(current)) return current;
      suspendedOk = true;
      setSuspended((list) => [
        { ...current, label: label ?? current.label, suspendedAt: new Date().toISOString() },
        ...list.filter((item) => item.id !== current.id),
      ].slice(0, 30));
      return emptySaleDraft();
    });
    return suspendedOk;
  }, []);

  const resume = useCallback<PosSaleState["resume"]>((id) => {
    setSuspended((list) => {
      const found = list.find((item) => item.id === id);
      if (!found) return list;
      setDraft((current) => {
        // A venda aberta não é descartada: ela volta para a fila de suspensas.
        if (isDraftDirty(current)) {
          setSuspended((inner) => [
            { ...current, suspendedAt: new Date().toISOString() },
            ...inner.filter((item) => item.id !== current.id && item.id !== id),
          ]);
        }
        return { ...found };
      });
      return list.filter((item) => item.id !== id);
    });
  }, []);

  const discard = useCallback<PosSaleState["discard"]>((id) => {
    setSuspended((list) => list.filter((item) => item.id !== id));
  }, []);

  const duplicate = useCallback(() => {
    setDraft((current) => {
      if (isDraftDirty(current)) {
        setSuspended((list) => [{ ...current, suspendedAt: new Date().toISOString() }, ...list].slice(0, 30));
      }
      return cloneDraft(current, newDraftId());
    });
  }, []);

  const setFulfillment = useCallback((value: PosFulfillment) => {
    setDraft((current) => ({
      ...current,
      fulfillment: value,
      tableNumber: value === "dine_in" ? current.tableNumber : "",
      tableSessionId: value === "dine_in" ? current.tableSessionId : null,
    }));
  }, []);

  return {
    draft,
    totals,
    suspended,
    isDirty: isDraftDirty(draft),
    hydrated,
    patch,
    addProduct,
    updateLine,
    changeQuantity,
    setQuantity,
    removeLine,
    clear,
    newSale,
    suspend,
    resume,
    discard,
    duplicate,
    setFulfillment,
  };
}
