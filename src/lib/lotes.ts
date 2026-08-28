/**
 * Controle de lote e validade do estoque.
 *
 * Cada lote guarda o saldo daquele "pacote" de mercadoria com código, validade
 * e custo. O saldo do produto continua sendo o total; o lote serve para saber
 * o que vence primeiro (FEFO) e alertar antes de perder mercadoria.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ProductBatch = Database["public"]["Tables"]["product_batches"]["Row"];

/** Quantos dias antes do vencimento o lote já entra em alerta. */
export const EXPIRY_WARNING_DAYS = 15;

export type BatchStatus = "vencido" | "vencendo" | "ok" | "sem-validade" | "esgotado";

export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  vencido: "Vencido",
  vencendo: "Vence em breve",
  ok: "Dentro da validade",
  "sem-validade": "Sem validade",
  esgotado: "Sem saldo",
};

export function batchesKey(storeId: string | undefined) {
  return ["lotes", storeId] as const;
}

function startOfToday(now: Date = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/** Dias que faltam para vencer (negativo quando já venceu). */
export function daysUntilExpiry(expiresAt: string | null, now: Date = new Date()): number | null {
  if (!expiresAt) return null;
  const target = new Date(`${expiresAt}T00:00:00`).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.round((target - startOfToday(now)) / 86_400_000);
}

export function batchStatus(
  batch: Pick<ProductBatch, "expires_at" | "quantity">,
  now: Date = new Date(),
): BatchStatus {
  if (Number(batch.quantity ?? 0) <= 0) return "esgotado";
  const days = daysUntilExpiry(batch.expires_at, now);
  if (days === null) return "sem-validade";
  if (days < 0) return "vencido";
  if (days <= EXPIRY_WARNING_DAYS) return "vencendo";
  return "ok";
}

export interface BatchSummary {
  total: number;
  expired: number;
  expiring: number;
  quantityAtRisk: number;
  valueAtRisk: number;
}

export function summarizeBatches(batches: ProductBatch[], now: Date = new Date()): BatchSummary {
  let expired = 0;
  let expiring = 0;
  let quantityAtRisk = 0;
  let valueAtRisk = 0;
  for (const batch of batches) {
    const status = batchStatus(batch, now);
    if (status !== "vencido" && status !== "vencendo") continue;
    if (status === "vencido") expired += 1;
    else expiring += 1;
    quantityAtRisk += Number(batch.quantity ?? 0);
    valueAtRisk += Number(batch.quantity ?? 0) * Number(batch.unit_cost ?? 0);
  }
  return { total: batches.length, expired, expiring, quantityAtRisk, valueAtRisk };
}

/** Ordena por validade mais próxima (FEFO); lotes sem validade vão ao fim. */
export function sortFefo(batches: ProductBatch[]): ProductBatch[] {
  return [...batches].sort((a, b) => {
    if (!a.expires_at && !b.expires_at) return 0;
    if (!a.expires_at) return 1;
    if (!b.expires_at) return -1;
    return a.expires_at.localeCompare(b.expires_at);
  });
}

export async function fetchBatches(storeId: string): Promise<ProductBatch[]> {
  const { data, error } = await supabase
    .from("product_batches")
    .select("*")
    .eq("store_id", storeId)
    .order("expires_at", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface BatchInput {
  id?: string | undefined;
  storeId: string;
  productId: string;
  variantId?: string | null;
  supplierId?: string | null;
  batchCode: string;
  expiresAt: string | null;
  quantity: number;
  unitCost: number;
  notes?: string | null;
}

export async function upsertBatch(input: BatchInput): Promise<void> {
  const payload = {
    store_id: input.storeId,
    product_id: input.productId,
    variant_id: input.variantId ?? null,
    supplier_id: input.supplierId ?? null,
    batch_code: input.batchCode.trim(),
    expires_at: input.expiresAt || null,
    quantity: Math.max(0, Number(input.quantity) || 0),
    unit_cost: Math.max(0, Number(input.unitCost) || 0),
    notes: input.notes?.trim() || null,
  };
  const query = input.id
    ? supabase.from("product_batches").update(payload).eq("id", input.id)
    : supabase.from("product_batches").insert(payload);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function deleteBatch(id: string): Promise<void> {
  const { error } = await supabase.from("product_batches").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Descarta um lote vencido: zera o saldo do lote, abate do produto e registra
 * a perda no histórico de movimentações.
 */
export async function discardBatch(batch: ProductBatch, reason: string): Promise<void> {
  const quantity = Number(batch.quantity ?? 0);
  if (quantity <= 0) return;

  const { data: product } = await supabase
    .from("products")
    .select("stock_quantity, track_stock")
    .eq("id", batch.product_id)
    .maybeSingle();

  const { error } = await supabase.from("product_batches").update({ quantity: 0 }).eq("id", batch.id);
  if (error) throw new Error(error.message);

  if (product?.track_stock) {
    await supabase
      .from("products")
      .update({ stock_quantity: Math.max(0, Number(product.stock_quantity ?? 0) - quantity) })
      .eq("id", batch.product_id);
  }

  await supabase.from("inventory_movements").insert({
    store_id: batch.store_id,
    product_id: batch.product_id,
    batch_id: batch.id,
    movement_type: "loss",
    quantity,
    reason: reason.trim() || `Descarte do lote ${batch.batch_code || "sem código"}`,
  });
}

/** Lotes de um produto com alerta ativo (vencido ou vencendo). */
export function batchAlertsByProduct(batches: ProductBatch[], now: Date = new Date()): Map<string, ProductBatch[]> {
  const map = new Map<string, ProductBatch[]>();
  for (const batch of sortFefo(batches)) {
    const status = batchStatus(batch, now);
    if (status !== "vencido" && status !== "vencendo") continue;
    map.set(batch.product_id, [...(map.get(batch.product_id) ?? []), batch]);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Relatório de risco e histórico de perdas                            */
/* ------------------------------------------------------------------ */

export interface BatchLoss {
  id: string;
  batch_id: string | null;
  product_id: string;
  quantity: number;
  reason: string | null;
  created_at: string;
}

export function batchLossesKey(storeId: string | undefined) {
  return ["lotes-perdas", storeId] as const;
}

/** Descartes registrados como perda no estoque (histórico do relatório). */
export async function fetchBatchLosses(storeId: string, days = 90): Promise<BatchLoss[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("inventory_movements")
    .select("id, batch_id, product_id, quantity, reason, created_at")
    .eq("store_id", storeId)
    .eq("movement_type", "loss")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ ...row, quantity: Number(row.quantity ?? 0) }));
}

/** Lotes vencidos ou vencendo, do mais crítico para o menos crítico. */
export function batchesAtRisk(batches: ProductBatch[], now: Date = new Date()): ProductBatch[] {
  return sortFefo(
    batches.filter((batch) => {
      const status = batchStatus(batch, now);
      return status === "vencido" || status === "vencendo";
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Notificações do time                                                */
/* ------------------------------------------------------------------ */

const EXPIRY_EVENT = "lote_vencendo";
const DISCARD_EVENT = "lote_descartado";

/** Avisa o time sobre um descarte por perda (chamado junto do descarte). */
export async function notifyBatchDiscard(batch: ProductBatch, quantity: number, productName: string, reason: string) {
  await supabase.from("notifications").insert({
    store_id: batch.store_id,
    event: DISCARD_EVENT,
    title: "Descarte por perda no estoque",
    body: `${productName}: ${quantity} un. do lote ${batch.batch_code || "sem código"} baixadas como perda. ${reason}`.trim(),
    payload: { batch_id: batch.id, product_id: batch.product_id, quantity } as never,
  });
}

/**
 * Cria um aviso por lote que vence nos próximos 15 dias (ou já venceu).
 * Só dispara uma vez por lote por dia para não encher a central.
 */
export async function notifyExpiringBatches(
  storeId: string,
  batches: ProductBatch[],
  productName: (id: string) => string,
  now: Date = new Date(),
): Promise<number> {
  const risky = batchesAtRisk(batches, now);
  if (risky.length === 0) return 0;

  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const { data: sent } = await supabase
    .from("notifications")
    .select("payload")
    .eq("store_id", storeId)
    .eq("event", EXPIRY_EVENT)
    .gte("created_at", dayStart)
    .limit(200);

  const already = new Set(
    (sent ?? [])
      .map((row) => (row.payload as { batch_id?: string } | null)?.batch_id)
      .filter((id): id is string => Boolean(id)),
  );

  const rows = risky
    .filter((batch) => !already.has(batch.id))
    .map((batch) => {
      const days = daysUntilExpiry(batch.expires_at, now) ?? 0;
      const when = days < 0 ? `venceu há ${Math.abs(days)} dia(s)` : days === 0 ? "vence hoje" : `vence em ${days} dia(s)`;
      return {
        store_id: storeId,
        event: EXPIRY_EVENT,
        title: days < 0 ? "Lote vencido no estoque" : "Lote perto do vencimento",
        body: `${productName(batch.product_id)}: lote ${batch.batch_code || "sem código"} ${when} (${Number(batch.quantity ?? 0)} un.).`,
        payload: { batch_id: batch.id, product_id: batch.product_id, expires_at: batch.expires_at } as never,
      };
    });

  if (rows.length === 0) return 0;
  await supabase.from("notifications").insert(rows);
  return rows.length;
}
