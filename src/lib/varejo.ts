/**
 * Módulo de varejo: grade de variações com SKU próprio, fornecedores e entrada
 * de mercadoria com custo médio, trocas/devoluções com crédito ao cliente,
 * reserva para retirada em loja e coleções (lookbook) com itens relacionados.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { nextInternalEan } from "@/lib/etiquetas";

type Tables = Database["public"]["Tables"];

export type VariantRow = Tables["product_variants"]["Row"];
export type SupplierRow = Tables["suppliers"]["Row"];
export type StockEntryRow = Tables["stock_entries"]["Row"];
export type StockEntryItemRow = Tables["stock_entry_items"]["Row"];
export type ReturnRow = Tables["store_returns"]["Row"];
export type ReturnItemRow = Tables["store_return_items"]["Row"];
export type CreditRow = Tables["customer_credits"]["Row"];
export type ReservationRow = Tables["store_reservations"]["Row"];
export type CollectionRow = Tables["product_collections"]["Row"];
export type CollectionItemRow = Tables["product_collection_items"]["Row"];
export type RelatedRow = Tables["product_related"]["Row"];

export const RETURN_KIND_LABEL: Record<string, string> = {
  return: "Devolução",
  exchange: "Troca",
};

export const RETURN_STATUS_LABEL: Record<string, string> = {
  open: "Em análise",
  approved: "Aprovada",
  rejected: "Recusada",
  done: "Concluída",
};

export const REFUND_METHOD_LABEL: Record<string, string> = {
  credit: "Crédito na loja",
  money: "Dinheiro / estorno",
  exchange: "Troca por outro item",
};

export const RESERVATION_STATUS_LABEL: Record<string, string> = {
  reserved: "Reservado",
  ready: "Pronto para retirada",
  notified: "Cliente avisado",
  picked_up: "Retirado",
  expired: "Prazo vencido",
  cancelled: "Cancelado",
};

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

export interface RetailData {
  variants: VariantRow[];
  collections: CollectionRow[];
  collectionItems: CollectionItemRow[];
  related: RelatedRow[];
  suppliers: SupplierRow[];
  entries: StockEntryRow[];
  entryItems: StockEntryItemRow[];
  returns: ReturnRow[];
  returnItems: ReturnItemRow[];
  credits: CreditRow[];
  reservations: ReservationRow[];
}

export function retailKey(storeId: string | undefined) {
  return ["varejo", storeId] as const;
}

export async function fetchRetail(storeId: string): Promise<RetailData> {
  const [
    variants,
    collections,
    collectionItems,
    related,
    suppliers,
    entries,
    entryItems,
    returns,
    returnItems,
    credits,
    reservations,
  ] = await Promise.all([
    supabase.from("product_variants").select("*").eq("store_id", storeId).order("sort_order"),
    supabase.from("product_collections").select("*").eq("store_id", storeId).order("sort_order"),
    supabase.from("product_collection_items").select("*").eq("store_id", storeId).order("sort_order"),
    supabase.from("product_related").select("*").eq("store_id", storeId).order("sort_order"),
    supabase.from("suppliers").select("*").eq("store_id", storeId).order("name"),
    supabase.from("stock_entries").select("*").eq("store_id", storeId).order("issued_at", { ascending: false }),
    supabase.from("stock_entry_items").select("*").eq("store_id", storeId),
    supabase.from("store_returns").select("*").eq("store_id", storeId).order("created_at", { ascending: false }),
    supabase.from("store_return_items").select("*").eq("store_id", storeId),
    supabase.from("customer_credits").select("*").eq("store_id", storeId).order("created_at", { ascending: false }),
    supabase.from("store_reservations").select("*").eq("store_id", storeId).order("created_at", { ascending: false }),
  ]);

  const failure = [
    variants,
    collections,
    collectionItems,
    related,
    suppliers,
    entries,
    entryItems,
    returns,
    returnItems,
    credits,
    reservations,
  ].find((result) => result.error);
  if (failure?.error) throw new Error(failure.error.message);

  return {
    variants: variants.data ?? [],
    collections: collections.data ?? [],
    collectionItems: collectionItems.data ?? [],
    related: related.data ?? [],
    suppliers: suppliers.data ?? [],
    entries: entries.data ?? [],
    entryItems: entryItems.data ?? [],
    returns: returns.data ?? [],
    returnItems: returnItems.data ?? [],
    credits: credits.data ?? [],
    reservations: reservations.data ?? [],
  };
}

/* ------------------------------------------------------------------ */
/* Grade de variações                                                  */
/* ------------------------------------------------------------------ */

export function variantLabel(variant: Pick<VariantRow, "option1_value" | "option2_value">): string {
  return [variant.option1_value, variant.option2_value].filter(Boolean).join(" / ") || "Padrão";
}

export function variantPrice(variant: VariantRow, fallback: number): number {
  const price = Number(variant.price ?? NaN);
  return Number.isFinite(price) && price > 0 ? price : fallback;
}

/** Cria a grade tamanho × cor, ignorando combinações que já existem. */
export async function generateVariantGrid(params: {
  storeId: string;
  productId: string;
  option1Name: string;
  option1Values: string[];
  option2Name: string;
  option2Values: string[];
  basePrice: number;
  skuPrefix: string;
  withBarcode: boolean;
  existing: VariantRow[];
}): Promise<number> {
  const values1 = dedupe(params.option1Values);
  const values2 = dedupe(params.option2Values);
  const combos: { one: string | null; two: string | null }[] = [];

  if (values1.length === 0 && values2.length === 0) return 0;
  if (values2.length === 0) {
    values1.forEach((one) => combos.push({ one, two: null }));
  } else if (values1.length === 0) {
    values2.forEach((two) => combos.push({ one: null, two }));
  } else {
    values1.forEach((one) => values2.forEach((two) => combos.push({ one, two })));
  }

  const taken = new Set(
    params.existing.map((variant) => `${variant.option1_value ?? ""}|${variant.option2_value ?? ""}`),
  );

  const rows = combos
    .filter((combo) => !taken.has(`${combo.one ?? ""}|${combo.two ?? ""}`))
    .map((combo, index) => ({
      store_id: params.storeId,
      product_id: params.productId,
      sku: buildSku(params.skuPrefix, combo.one, combo.two),
      barcode: params.withBarcode ? nextInternalEan(index) : null,
      option1_name: combo.one ? params.option1Name : null,
      option1_value: combo.one,
      option2_name: combo.two ? params.option2Name : null,
      option2_value: combo.two,
      price: params.basePrice > 0 ? params.basePrice : null,
      stock_quantity: 0,
      min_stock: 0,
      sort_order: params.existing.length + index + 1,
    }));

  if (rows.length === 0) return 0;

  const { error } = await supabase.from("product_variants").insert(rows);
  if (error) throw new Error(error.message);

  await supabase.from("products").update({ has_variants: true }).eq("id", params.productId);
  return rows.length;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function buildSku(prefix: string, one: string | null, two: string | null): string {
  const parts = [prefix, one, two].filter(Boolean).map((part) =>
    String(part)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "")
      .toUpperCase()
      .slice(0, 6),
  );
  return parts.join("-") || "SKU";
}

export async function updateVariant(id: string, patch: Partial<Tables["product_variants"]["Update"]>) {
  const { error } = await supabase.from("product_variants").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteVariant(id: string) {
  const { error } = await supabase.from("product_variants").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setProductHasVariants(productId: string, value: boolean) {
  const { error } = await supabase.from("products").update({ has_variants: value }).eq("id", productId);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Fornecedores e entrada de mercadoria                                */
/* ------------------------------------------------------------------ */

export async function upsertSupplier(input: {
  id?: string;
  storeId: string;
  name: string;
  document: string;
  phone: string;
  email: string;
  notes: string;
}) {
  const payload = {
    store_id: input.storeId,
    name: input.name.trim(),
    document: input.document.trim() || null,
    phone: input.phone.trim() || null,
    email: input.email.trim() || null,
    notes: input.notes.trim() || null,
  };
  const query = input.id
    ? supabase.from("suppliers").update(payload).eq("id", input.id)
    : supabase.from("suppliers").insert(payload);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function deleteSupplier(id: string) {
  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export interface EntryItemDraft {
  productId: string | null;
  variantId: string | null;
  description: string;
  quantity: number;
  unitCost: number;
}

export async function createStockEntry(input: {
  storeId: string;
  supplierId: string | null;
  invoiceNumber: string;
  issuedAt: string;
  freight: number;
  otherCosts: number;
  notes: string;
  items: EntryItemDraft[];
}): Promise<string> {
  const items = input.items.filter((item) => item.quantity > 0 && (item.productId || item.variantId));
  if (items.length === 0) throw new Error("Adicione pelo menos um item à nota.");

  const total =
    items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0) + input.freight + input.otherCosts;

  const { data, error } = await supabase
    .from("stock_entries")
    .insert({
      store_id: input.storeId,
      supplier_id: input.supplierId,
      invoice_number: input.invoiceNumber.trim() || null,
      issued_at: input.issuedAt,
      freight: input.freight,
      other_costs: input.otherCosts,
      total,
      notes: input.notes.trim() || null,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Falha ao criar a nota.");

  const { error: itemsError } = await supabase.from("stock_entry_items").insert(
    items.map((item) => ({
      store_id: input.storeId,
      entry_id: data.id,
      product_id: item.productId,
      variant_id: item.variantId,
      description: item.description.trim() || null,
      quantity: item.quantity,
      unit_cost: item.unitCost,
      total: item.quantity * item.unitCost,
    })),
  );
  if (itemsError) throw new Error(itemsError.message);

  return data.id;
}

/** Lança a nota no estoque: soma saldo e recalcula o custo médio de cada item. */
export async function applyStockEntry(entryId: string) {
  const { error } = await supabase.rpc("apply_stock_entry", { _entry_id: entryId });
  if (error) throw new Error(error.message);
}

export async function deleteStockEntry(id: string) {
  const { error } = await supabase.from("stock_entries").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Trocas, devoluções e crédito                                        */
/* ------------------------------------------------------------------ */

export interface ReturnItemDraft {
  productId: string | null;
  variantId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export async function createReturn(input: {
  storeId: string;
  orderId: string | null;
  customerName: string;
  customerPhone: string;
  kind: "return" | "exchange";
  reason: string;
  refundMethod: "credit" | "money" | "exchange";
  restock: boolean;
  items: ReturnItemDraft[];
  creditExpiresAt: string | null;
}): Promise<{ total: number }> {
  const items = input.items.filter((item) => item.quantity > 0);
  if (items.length === 0) throw new Error("Informe os itens devolvidos.");
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const { data, error } = await supabase
    .from("store_returns")
    .insert({
      store_id: input.storeId,
      order_id: input.orderId,
      customer_name: input.customerName.trim() || null,
      customer_phone: input.customerPhone.trim() || null,
      kind: input.kind,
      reason: input.reason.trim() || null,
      refund_method: input.refundMethod,
      restock: input.restock,
      total,
      status: "approved",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Falha ao registrar a devolução.");

  const { error: itemsError } = await supabase.from("store_return_items").insert(
    items.map((item) => ({
      store_id: input.storeId,
      return_id: data.id,
      product_id: item.productId,
      variant_id: item.variantId,
      product_name: item.productName,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total: item.quantity * item.unitPrice,
    })),
  );
  if (itemsError) throw new Error(itemsError.message);

  if (input.restock) {
    await Promise.all(items.map((item) => restockReturnedItem(input.storeId, item)));
  }

  if (input.refundMethod === "credit" && total > 0) {
    const { error: creditError } = await supabase.from("customer_credits").insert({
      store_id: input.storeId,
      return_id: data.id,
      customer_name: input.customerName.trim() || null,
      customer_phone: input.customerPhone.trim() || null,
      amount: total,
      balance: total,
      origin: "return",
      expires_at: input.creditExpiresAt,
    });
    if (creditError) throw new Error(creditError.message);
  }

  return { total };
}

async function restockReturnedItem(storeId: string, item: ReturnItemDraft) {
  if (item.variantId) {
    const { data } = await supabase
      .from("product_variants")
      .select("stock_quantity")
      .eq("id", item.variantId)
      .maybeSingle();
    await supabase
      .from("product_variants")
      .update({ stock_quantity: Number(data?.stock_quantity ?? 0) + item.quantity })
      .eq("id", item.variantId);
  } else if (item.productId) {
    const { data } = await supabase
      .from("products")
      .select("stock_quantity, track_stock")
      .eq("id", item.productId)
      .maybeSingle();
    if (!data?.track_stock) return;
    await supabase
      .from("products")
      .update({ stock_quantity: Number(data.stock_quantity ?? 0) + item.quantity })
      .eq("id", item.productId);
  } else {
    return;
  }

  if (!item.productId) return;

  await supabase.from("inventory_movements").insert({
    store_id: storeId,
    product_id: item.productId,
    variant_id: item.variantId,
    movement_type: "in",
    quantity: item.quantity,
    reason: "Devolução do cliente",
  });
}

export async function updateReturnStatus(id: string, status: string) {
  const { error } = await supabase.from("store_returns").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Consome parte do crédito do cliente (uso em uma nova compra). */
export async function useCredit(credit: CreditRow, amount: number) {
  const next = Math.max(0, Number(credit.balance) - amount);
  const { error } = await supabase.from("customer_credits").update({ balance: next }).eq("id", credit.id);
  if (error) throw new Error(error.message);
  return next;
}

export function creditBalanceByPhone(credits: CreditRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const credit of credits) {
    const phone = (credit.customer_phone ?? "").replace(/\D/g, "");
    if (!phone) continue;
    if (credit.expires_at && new Date(credit.expires_at) < new Date()) continue;
    map.set(phone, (map.get(phone) ?? 0) + Number(credit.balance));
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Reserva e retirada em loja                                          */
/* ------------------------------------------------------------------ */

export async function createReservation(input: {
  storeId: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  customerName: string;
  customerPhone: string;
  quantity: number;
  deadlineHours: number;
  notes: string;
}) {
  const deadline = new Date(Date.now() + Math.max(1, input.deadlineHours) * 3600_000).toISOString();
  const { error } = await supabase.from("store_reservations").insert({
    store_id: input.storeId,
    product_id: input.productId,
    variant_id: input.variantId,
    product_name: input.productName,
    customer_name: input.customerName.trim(),
    customer_phone: input.customerPhone.trim() || null,
    quantity: input.quantity,
    pickup_deadline: deadline,
    status: "reserved",
    notes: input.notes.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function updateReservation(id: string, patch: Partial<Tables["store_reservations"]["Update"]>) {
  const { error } = await supabase.from("store_reservations").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export function reservationIsLate(reservation: ReservationRow): boolean {
  if (!reservation.pickup_deadline) return false;
  if (["picked_up", "cancelled", "expired"].includes(reservation.status)) return false;
  return new Date(reservation.pickup_deadline) < new Date();
}

/** Mensagem pronta de aviso de retirada para enviar ao cliente no WhatsApp. */
export function pickupMessage(reservation: ReservationRow, storeName: string): string {
  const deadline = reservation.pickup_deadline
    ? new Date(reservation.pickup_deadline).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : null;
  return [
    `Olá, ${reservation.customer_name}! Aqui é da ${storeName}.`,
    `Seu item "${reservation.product_name}" está reservado e pronto para retirada.`,
    deadline ? `Guardamos para você até ${deadline}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function whatsappLink(phone: string | null, message: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

/* ------------------------------------------------------------------ */
/* Coleções e itens relacionados                                       */
/* ------------------------------------------------------------------ */

export async function upsertCollection(input: {
  id?: string;
  storeId: string;
  name: string;
  description: string;
  coverUrl: string;
  isActive: boolean;
  sortOrder: number;
}) {
  const payload = {
    store_id: input.storeId,
    name: input.name.trim(),
    description: input.description.trim() || null,
    cover_url: input.coverUrl.trim() || null,
    is_active: input.isActive,
    sort_order: input.sortOrder,
  };
  const query = input.id
    ? supabase.from("product_collections").update(payload).eq("id", input.id)
    : supabase.from("product_collections").insert(payload);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function deleteCollection(id: string) {
  const { error } = await supabase.from("product_collections").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setCollectionProducts(storeId: string, collectionId: string, productIds: string[]) {
  const { error: clearError } = await supabase
    .from("product_collection_items")
    .delete()
    .eq("collection_id", collectionId);
  if (clearError) throw new Error(clearError.message);
  if (productIds.length === 0) return;
  const { error } = await supabase.from("product_collection_items").insert(
    productIds.map((productId, index) => ({
      store_id: storeId,
      collection_id: collectionId,
      product_id: productId,
      sort_order: index + 1,
    })),
  );
  if (error) throw new Error(error.message);
}

export async function setRelatedProducts(storeId: string, productId: string, relatedIds: string[]) {
  const { error: clearError } = await supabase.from("product_related").delete().eq("product_id", productId);
  if (clearError) throw new Error(clearError.message);
  const ids = relatedIds.filter((id) => id !== productId);
  if (ids.length === 0) return;
  const { error } = await supabase.from("product_related").insert(
    ids.map((relatedId, index) => ({
      store_id: storeId,
      product_id: productId,
      related_product_id: relatedId,
      sort_order: index + 1,
    })),
  );
  if (error) throw new Error(error.message);
}
