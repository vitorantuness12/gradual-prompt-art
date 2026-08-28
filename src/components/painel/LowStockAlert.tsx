import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface LowStockRow {
  kind: string;
  id: string;
  name: string;
  stock: number;
  min_stock: number;
  unit: string;
}

/** Alerta de ruptura: produtos e ingredientes no ou abaixo do estoque mínimo. */
export function LowStockAlert({ storeId }: { storeId: string | undefined }) {
  const { data } = useQuery({
    queryKey: ["low-stock", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("low_stock_alerts", { _store_id: storeId! });
      if (error) throw new Error(error.message);
      return (data ?? []) as LowStockRow[];
    },
  });

  const rows = data ?? [];
  if (rows.length === 0) return null;

  return (
    <Card className="mb-6 border-amber-500/40 bg-amber-500/5 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4 text-amber-500" aria-hidden="true" />
          Alerta de ruptura de estoque ({rows.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 sm:grid-cols-2">
          {rows.map((row) => (
            <li
              key={`${row.kind}-${row.id}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <Badge variant="secondary" className="capitalize">
                  {row.kind}
                </Badge>
                <span className="font-medium text-foreground">{row.name}</span>
              </span>
              <span className="text-muted-foreground">
                {Number(row.stock)} {row.unit} · mín. {Number(row.min_stock)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
