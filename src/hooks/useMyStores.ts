import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type StoreRow = Database["public"]["Tables"]["stores"]["Row"];

export interface Membership {
  storeId: string;
  role: AppRole;
  store: StoreRow;
}

const ACTIVE_STORE_KEY = "seu-pedido:loja-ativa";

/** Lojas às quais o usuário autenticado pertence, com o papel dele em cada uma. */
export function useMyStores() {
  return useQuery({
    queryKey: ["my-stores"],
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await supabase
        .from("store_members")
        .select("store_id, role, store:stores(*)")
        .order("created_at");

      if (error) throw new Error(error.message);

      return (data ?? [])
        .filter((row) => row.store)
        .map((row) => ({
          storeId: row.store_id,
          role: row.role,
          store: row.store as StoreRow,
        }));
    },
  });
}

/** Loja atualmente selecionada no painel, persistida no navegador. */
export function useActiveStore() {
  const query = useMyStores();
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(ACTIVE_STORE_KEY);
    setActiveId(stored);
  }, []);

  const memberships = query.data ?? [];
  const active = memberships.find((item) => item.storeId === activeId) ?? memberships[0] ?? null;

  function selectStore(storeId: string) {
    setActiveId(storeId);
    if (typeof window !== "undefined") window.localStorage.setItem(ACTIVE_STORE_KEY, storeId);
  }

  return { ...query, memberships, active, selectStore };
}

/** Indica se o papel informado pode gerenciar configurações e equipe. */
export function canManage(role: AppRole | undefined): boolean {
  return role === "owner" || role === "manager" || role === "super_admin";
}
