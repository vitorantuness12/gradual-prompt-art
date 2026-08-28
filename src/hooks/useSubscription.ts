import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { LimitKey, PlanRow, SubscriptionRow } from "@/lib/plans";
import { isOverLimit, planLimit } from "@/lib/plans";

export interface StoreUsage {
  users: number;
  stores: number;
  products: number;
  orders_month: number;
  automations: number;
  integrations: number;
  couriers: number;
}

export interface SubscriptionInfo {
  subscription: SubscriptionRow | null;
  plan: PlanRow | null;
  usage: StoreUsage;
}

const EMPTY_USAGE: StoreUsage = {
  users: 0,
  stores: 1,
  products: 0,
  orders_month: 0,
  automations: 0,
  integrations: 0,
  couriers: 0,
};

/** Lista de planos ativos, usada na comparação e no upgrade. */
export function usePlans(includeInactive = false) {
  return useQuery({
    queryKey: ["plans", includeInactive],
    queryFn: async (): Promise<PlanRow[]> => {
      let query = supabase.from("plans").select("*").order("sort_order");
      if (!includeInactive) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/** Assinatura da loja + uso atual de cada limite. */
export function useSubscription(storeId: string | undefined) {
  return useQuery({
    queryKey: ["subscription", storeId],
    enabled: Boolean(storeId),
    queryFn: async (): Promise<SubscriptionInfo> => {
      if (!storeId) return { subscription: null, plan: null, usage: EMPTY_USAGE };

      const { data: subscription, error } = await supabase
        .from("store_subscriptions")
        .select("*, plan:plans(*)")
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) throw new Error(error.message);

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [members, products, orders, automations, integrations, couriers] = await Promise.all([
        supabase.from("store_members").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("is_active", true),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", storeId).is("archived_at", null),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("store_id", storeId)
          .gte("created_at", monthStart.toISOString()),
        supabase.from("automation_rules").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("is_active", true),
        supabase.from("store_integrations").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("is_enabled", true),
        supabase.from("couriers").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("is_active", true),
      ]);

      return {
        subscription: (subscription as SubscriptionRow) ?? null,
        plan: ((subscription as unknown as { plan: PlanRow } | null)?.plan as PlanRow) ?? null,
        usage: {
          users: members.count ?? 0,
          stores: 1,
          products: products.count ?? 0,
          orders_month: orders.count ?? 0,
          automations: automations.count ?? 0,
          integrations: integrations.count ?? 0,
          couriers: couriers.count ?? 0,
        },
      };
    },
  });
}

/** Verifica se a loja pode criar mais um item de determinado limite. */
export function useLimitCheck(storeId: string | undefined, key: LimitKey) {
  const query = useSubscription(storeId);
  const plan = query.data?.plan ?? null;
  const limit = planLimit(plan, key);
  const current = query.data?.usage[key] ?? 0;
  return {
    isLoading: query.isLoading,
    plan,
    limit,
    current,
    blocked: Boolean(plan) && isOverLimit(current, limit),
  };
}
