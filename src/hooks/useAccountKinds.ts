import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { AccountKindsResult } from "@/lib/contas";

const EMPTY: AccountKindsResult = {
  customer: false,
  courier: false,
  courier_status: null,
  merchant: false,
  super_admin: false,
};

export async function fetchAccountKinds(): Promise<AccountKindsResult> {
  const { data, error } = await supabase.rpc("my_account_kinds");
  if (error || !data) return EMPTY;
  return { ...EMPTY, ...(data as unknown as AccountKindsResult) };
}

/** Perfis que a pessoa logada possui (cliente, motoboy, lojista, superadmin). */
export function useAccountKinds() {
  return useQuery({
    queryKey: ["account-kinds"],
    queryFn: fetchAccountKinds,
    staleTime: 30_000,
  });
}
