import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileLock2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import {
  DATA_REQUEST_KINDS,
  DATA_REQUEST_STATUS_LABEL,
  dataRequestsKey,
  listStoreDataRequests,
  registerDataRequest,
  resolveDataRequest,
} from "@/lib/privacidade-loja.functions";

/** Pedidos de cópia, correção ou exclusão de dados feitos pelos clientes da loja. */
export function PrivacyRequestsCard({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listStoreDataRequests);
  const registerFn = useServerFn(registerDataRequest);
  const resolveFn = useServerFn(resolveDataRequest);

  const [kind, setKind] = useState("delete");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");

  const requests = useQuery({
    queryKey: dataRequestsKey(storeId),
    queryFn: () => listFn({ data: { storeId } }),
    enabled: Boolean(storeId),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: dataRequestsKey(storeId) });

  const register = useMutation({
    mutationFn: () =>
      registerFn({
        data: {
          storeId,
          kind: kind as "export" | "delete" | "correction" | "opt_out",
          contact: contact.trim(),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setContact("");
      setNote("");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resolve = useMutation({
    mutationFn: (input: { requestId: string; status: "in_progress" | "done" | "rejected" }) =>
      resolveFn({ data: { storeId, ...input } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    register.mutate();
  };

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileLock2 className="size-4 text-primary" aria-hidden="true" />
          Pedidos de dados dos seus clientes
        </CardTitle>
        <CardDescription>
          Registre e responda pedidos de cópia, correção ou exclusão de dados. A lei dá até 15 dias
          para responder.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="tipo-pedido">Tipo do pedido</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger id="tipo-pedido">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATA_REQUEST_KINDS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contato-pedido">Telefone ou e-mail do cliente</Label>
            <Input
              id="contato-pedido"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="obs-pedido">Observação</Label>
            <Textarea
              id="obs-pedido"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="O que o cliente pediu e por qual canal"
            />
          </div>
          <Button type="submit" className="sm:col-span-2" disabled={register.isPending}>
            {register.isPending ? "Registrando..." : "Registrar pedido recebido"}
          </Button>
        </form>

        {requests.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !requests.data?.length ? (
          <p className="text-sm text-muted-foreground">Nenhum pedido registrado até agora.</p>
        ) : (
          <ul className="space-y-2 border-t border-border/70 pt-3">
            {requests.data.map((row) => (
              <li key={row.id} className="space-y-2 rounded-lg border border-border/60 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {DATA_REQUEST_KINDS.find((item) => item.value === row.kind)?.label ?? row.kind}
                    {row.contact ? ` · ${row.contact}` : ""}
                  </span>
                  <Badge variant={row.status === "done" ? "secondary" : "outline"}>
                    {DATA_REQUEST_STATUS_LABEL[row.status] ?? row.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Recebido em {formatDateTime(row.created_at)}
                  {row.note ? ` · ${row.note}` : ""}
                </p>
                {row.status !== "done" && row.status !== "rejected" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => resolve.mutate({ requestId: row.id, status: "in_progress" })}
                    >
                      Em análise
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => resolve.mutate({ requestId: row.id, status: "done" })}
                    >
                      Marcar como atendido
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => resolve.mutate({ requestId: row.id, status: "rejected" })}
                    >
                      Recusar
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
