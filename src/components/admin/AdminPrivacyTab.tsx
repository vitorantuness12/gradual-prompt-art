import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, StatCard } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { DATA_REQUEST_KINDS, DATA_REQUEST_STATUS_LABEL } from "@/lib/privacidade-loja.functions";
import { listAdminPrivacyRequests, updateAdminPrivacyRequest } from "@/lib/superadmin.functions";

const KIND_LABEL = Object.fromEntries(DATA_REQUEST_KINDS.map((item) => [item.value, item.label]));

export function AdminPrivacyTab() {
  const queryClient = useQueryClient();
  const listRequests = useServerFn(listAdminPrivacyRequests);
  const updateRequest = useServerFn(updateAdminPrivacyRequest);
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["admin-privacy", status, page],
    queryFn: () => listRequests({ data: { status, page } }),
  });
  const update = useMutation({
    mutationFn: (input: { requestId: string; status: "pending" | "in_progress" | "done" | "rejected" }) => updateRequest({ data: input }),
    onSuccess: () => {
      toast.success("Solicitação atualizada e registrada na auditoria.");
      void queryClient.invalidateQueries({ queryKey: ["admin-privacy"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = query.data?.rows ?? [];
  const pending = rows.filter((row) => row.status === "pending").length;
  const inProgress = rows.filter((row) => row.status === "in_progress" || row.status === "processing").length;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Solicitações encontradas" value={String(query.data?.total ?? 0)} />
        <StatCard label="Aguardando" value={String(pending)} hint="Nesta página" />
        <StatCard label="Em análise" value={String(inProgress)} hint="Nesta página" />
      </div>
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5" /> Privacidade e LGPD</CardTitle>
            <CardDescription>Acompanhe solicitações de acesso, correção, exclusão e cancelamento de mensagens.</CardDescription>
          </div>
          <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as situações</SelectItem>
              <SelectItem value="pending">Aguardando</SelectItem>
              <SelectItem value="in_progress">Em análise</SelectItem>
              <SelectItem value="done">Concluídas</SelectItem>
              <SelectItem value="rejected">Recusadas</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {query.isLoading ? <Skeleton className="h-52" /> : rows.length === 0 ? <EmptyState title="Nenhuma solicitação neste filtro" /> : (
            <div className="divide-y divide-border">
              {rows.map((row) => (
                <div key={row.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{KIND_LABEL[row.kind] ?? row.kind}</p>
                      <Badge variant="secondary">{DATA_REQUEST_STATUS_LABEL[row.status] ?? row.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{row.storeName ?? "Solicitação da plataforma"} · {row.contact ?? "Contato não informado"}</p>
                    <p className="text-xs text-muted-foreground">Recebida em {formatDate(row.createdAt)}{row.handledAt ? ` · tratada em ${formatDate(row.handledAt)}` : ""}</p>
                    {row.note ? <p className="mt-2 text-sm text-foreground">{row.note}</p> : null}
                  </div>
                  <Select value={row.status === "processing" ? "in_progress" : row.status} onValueChange={(next) => update.mutate({ requestId: row.id, status: next as "pending" | "in_progress" | "done" | "rejected" })}>
                    <SelectTrigger className="w-full md:w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Aguardando</SelectItem>
                      <SelectItem value="in_progress">Em análise</SelectItem>
                      <SelectItem value="done">Concluída</SelectItem>
                      <SelectItem value="rejected">Recusada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">Página {page}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" aria-label="Página anterior" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft /></Button>
              <Button variant="outline" size="icon" aria-label="Próxima página" disabled={rows.length < 30} onClick={() => setPage((value) => value + 1)}><ChevronRight /></Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}