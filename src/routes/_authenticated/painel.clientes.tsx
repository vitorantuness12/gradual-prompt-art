import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DemoBadge } from "@/components/brand/DemoBadge";
import { EmptyState, PageHeader } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/painel/clientes")({
  component: CustomersPage,
});

function CustomersPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["customers", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("customers")
        .select("*, loyalty_accounts(points_balance, cashback_balance, loyalty_tiers(name, color))")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return rows ?? [];
    },
  });

  const { data: blocks } = useQuery({
    queryKey: ["customer-blocks-simple", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("customer_blocks")
        .select("phone")
        .eq("store_id", storeId!)
        .eq("is_active", true);
      return (rows ?? []).map((row) => row.phone.replace(/\D/g, ""));
    },
  });

  const blockedPhones = new Set(blocks ?? []);

  const customers = (data ?? []).filter((customer) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      customer.name.toLowerCase().includes(term) ||
      (customer.phone ?? "").toLowerCase().includes(term) ||
      (customer.email ?? "").toLowerCase().includes(term)
    );
  });

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Base de clientes desta loja, visível apenas para a sua equipe."
      />

      <div className="mb-4 max-w-sm">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome, telefone ou e-mail"
          aria-label="Buscar clientes"
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : customers.length === 0 ? (
        <EmptyState
          title="Nenhum cliente encontrado"
          description="Clientes são criados conforme os pedidos chegam."
        />
      ) : (
        <div className="space-y-3">
          {customers.map((customer) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const wallet = ((customer as any).loyalty_accounts ?? null) as {
              points_balance: number;
              cashback_balance: number;
              loyalty_tiers: { name: string; color: string } | null;
            } | null;
            const blocked = blockedPhones.has((customer.phone ?? "").replace(/\D/g, ""));
            return (
              <Card key={customer.id} className="border-border/70 shadow-sm">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium text-foreground">{customer.name}</h2>
                      {customer.is_demo ? <DemoBadge /> : null}
                      {wallet?.loyalty_tiers ? (
                        <Badge
                          style={{ backgroundColor: wallet.loyalty_tiers.color, color: "#111" }}
                        >
                          {wallet.loyalty_tiers.name}
                        </Badge>
                      ) : null}
                      {blocked ? <Badge variant="destructive">Bloqueado</Badge> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {customer.phone ?? "sem telefone"} · {customer.email ?? "sem e-mail"}
                      {customer.district ? ` · ${customer.district}` : ""}
                    </p>
                    {wallet ? (
                      <p className="text-sm text-muted-foreground">
                        {wallet.points_balance} pontos · cashback{" "}
                        {formatCurrency(Number(wallet.cashback_balance))}
                      </p>
                    ) : null}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Desde {formatDate(customer.created_at)}
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
