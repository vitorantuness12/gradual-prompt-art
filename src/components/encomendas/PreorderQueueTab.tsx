import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { EmptyState } from "@/components/painel/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";

export interface PreorderQueueTabProps {
  storeId: string;
}

export function PreorderQueueTab({ storeId }: PreorderQueueTabProps) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["production-queue", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_queue")
        .select("*")
        .eq("store_id", storeId)
        .order("desired_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("production_queue").update({ status }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Fila atualizada.");
      await queryClient.invalidateQueries({ queryKey: ["production-queue", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading) return <Skeleton className="h-32" />;
  if ((query.data ?? []).length === 0) {
    return <EmptyState title="Fila vazia" description="Pedidos sem vaga na produção aparecerão aqui." />;
  }

  return (
    <div className="space-y-3">
      {(query.data ?? []).map((item) => (
        <Card key={item.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div>
              <h2 className="font-medium">#{item.position} · {item.customer_name}</h2>
              <p className="text-sm text-muted-foreground">
                Para {formatDateTime(item.desired_at)} · {item.items_count} item(ns)
                {item.customer_phone ? ` · ${item.customer_phone}` : ""}
              </p>
              {item.notes ? <p className="text-sm text-muted-foreground">Obs.: {item.notes}</p> : null}
            </div>
            <Select value={item.status} onValueChange={(status) => update.mutate({ id: item.id, status })}>
              <SelectTrigger className="w-48" aria-label="Situação na fila">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="waiting">Aguardando</SelectItem>
                <SelectItem value="contacted">Cliente avisado</SelectItem>
                <SelectItem value="scheduled">Confirmado</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}