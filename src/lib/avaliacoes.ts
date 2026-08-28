import { supabase } from "@/integrations/supabase/client";

export interface StoreReview {
  id: string;
  store_id: string;
  order_id: string | null;
  customer_name: string;
  rating: number;
  comment: string | null;
  reply: string | null;
  replied_at: string | null;
  is_published: boolean;
  created_at: string;
}

export interface RatingSummary {
  average: number;
  count: number;
}

/** Avaliações publicadas de uma loja (visão pública). */
export async function fetchPublicReviews(storeId: string, limit = 20): Promise<StoreReview[]> {
  const { data, error } = await supabase
    .from("store_reviews")
    .select("*")
    .eq("store_id", storeId)
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as StoreReview[];
}

/** Média e total de avaliações publicadas. */
export async function fetchRatingSummary(storeId: string): Promise<RatingSummary> {
  const { data, error } = await supabase.rpc("store_rating_summary", { _store_id: storeId });
  if (error) throw new Error(error.message);
  const value = (data ?? {}) as { average?: number; count?: number };
  return { average: Number(value.average ?? 0), count: Number(value.count ?? 0) };
}

/** Todas as avaliações da loja (painel do lojista). */
export async function fetchStoreReviews(storeId: string): Promise<StoreReview[]> {
  const { data, error } = await supabase
    .from("store_reviews")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as StoreReview[];
}

/** Envia a avaliação do cliente para um pedido concluído. */
export async function submitReview(input: {
  storeId: string;
  orderId: string;
  customerName: string;
  rating: number;
  comment: string;
}) {
  const { error } = await supabase.from("store_reviews").insert({
    store_id: input.storeId,
    order_id: input.orderId,
    customer_name: input.customerName.trim().slice(0, 60) || "Cliente",
    rating: input.rating,
    comment: input.comment.trim().slice(0, 600) || null,
  });
  if (error) throw new Error(error.message);
}

/** Verifica se o pedido já foi avaliado. */
export async function orderHasReview(orderId: string) {
  const { count, error } = await supabase
    .from("store_reviews")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);
  if (error) return false;
  return (count ?? 0) > 0;
}

export const REVIEW_ELIGIBLE_STATUS = ["delivered", "completed", "picked_up", "paid"];
