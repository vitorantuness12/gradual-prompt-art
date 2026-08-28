import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WAITLIST_STATUS,
  addToWaitlist,
  deleteWaitlistEntry,
  fetchProfessionals,
  fetchWaitlist,
  professionalsKey,
  updateWaitlistStatus,
  waitlistKey,
} from "@/lib/agenda";

/** Lista de espera para encaixe quando um horário vaga. */
export function WaitlistTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [professionalId, setProfessionalId] = useState("any");
  const [period, setPeriod] = useState("any");

  const waitlist = useQuery({ queryKey: waitlistKey(storeId), queryFn: () => fetchWaitlist(storeId) });
  const professionals = useQuery({
    queryKey: professionalsKey(storeId),
    queryFn: () => fetchProfessionals(storeId),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: waitlistKey(storeId) });

  const add = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const fd = new FormData(form);
      await addToWaitlist({
        storeId,
        customerName: String(fd.get("customerName") ?? ""),
        customerPhone: String(fd.get("customerPhone") ?? ""),
        productId: null,
        professionalId: professionalId === "any" ? null : professionalId,
        preferredDate: (fd.get("preferredDate") as string) || null,
        preferredPeriod: period === "any" ? null : period,
        notes: String(fd.get("notes") ?? ""),
      });
      form.reset();
    },
    onSuccess: () => {
      toast.success("Cliente na lista de espera.");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateWaitlistStatus(id, status),
    onSuccess: () => void refresh(),
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteWaitlistEntry(id),
    onSuccess: () => void refresh(),
    onError: (error: Error) => toast.error(error.message),
  });

  const professionalName = (id: string | null) =>
    id ? (professionals.data ?? []).find((item) => item.id === id)?.name ?? "Profissional" : "Qualquer profissional";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adicionar à lista de espera</CardTitle>
          <CardDescription>Quando um horário vagar, chame quem já está esperando.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              add.mutate(event.currentTarget);
            }}
          >
            <div>
              <Label htmlFor="customerName">Cliente</Label>
              <Input id="customerName" name="customerName" required />
            </div>
            <div>
              <Label htmlFor="customerPhone">WhatsApp</Label>
              <Input id="customerPhone" name="customerPhone" placeholder="(00) 00000-0000" />
            </div>
            <div>
              <Label>Profissional</Label>
              <Select value={professionalId} onValueChange={setProfessionalId}>
                <SelectTrigger aria-label="Profissional preferido">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer profissional</SelectItem>
                  {(professionals.data ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="preferredDate">Data desejada</Label>
              <Input id="preferredDate" name="preferredDate" type="date" />
            </div>
            <div>
              <Label>Período</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger aria-label="Período preferido">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer horário</SelectItem>
                  <SelectItem value="manha">Manhã</SelectItem>
                  <SelectItem value="tarde">Tarde</SelectItem>
                  <SelectItem value="noite">Noite</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="notes">Observação</Label>
              <Input id="notes" name="notes" placeholder="Serviço desejado, preferências..." />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={add.isPending}>
                {add.isPending ? "Salvando..." : "Entrar na lista"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {waitlist.isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : (waitlist.data ?? []).length === 0 ? (
        <EmptyState title="Ninguém na espera" description="Cadastre clientes para encaixar assim que abrir vaga." />
      ) : (
        <div className="space-y-2">
          {(waitlist.data ?? []).map((entry) => (
            <Card key={entry.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                <div>
                  <p className="font-medium text-foreground">{entry.customer_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {professionalName(entry.professional_id)}
                    {entry.preferred_date ? ` · ${new Date(`${entry.preferred_date}T00:00:00`).toLocaleDateString("pt-BR")}` : ""}
                    {entry.preferred_period ? ` · ${entry.preferred_period}` : ""}
                    {entry.customer_phone ? ` · ${entry.customer_phone}` : ""}
                  </p>
                  {entry.notes ? <p className="text-xs text-muted-foreground">{entry.notes}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Select value={entry.status} onValueChange={(status) => update.mutate({ id: entry.id, status })}>
                    <SelectTrigger className="w-48" aria-label="Situação na lista de espera">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(WAITLIST_STATUS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" aria-label="Remover da lista" onClick={() => remove.mutate(entry.id)}>
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
