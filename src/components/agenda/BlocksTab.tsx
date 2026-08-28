import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  WEEKDAYS,
  blockLabel,
  blocksKey,
  createBlock,
  deleteBlock,
  fetchBlocks,
  fetchProfessionals,
  professionalsKey,
} from "@/lib/agenda";

/** Bloqueios de agenda: férias e datas fixas ou folga/almoço toda semana. */
export function BlocksTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [recurring, setRecurring] = useState(true);
  const [professionalId, setProfessionalId] = useState("all");
  const [weekday, setWeekday] = useState("1");

  const blocks = useQuery({ queryKey: blocksKey(storeId), queryFn: () => fetchBlocks(storeId) });
  const professionals = useQuery({
    queryKey: professionalsKey(storeId),
    queryFn: () => fetchProfessionals(storeId),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: blocksKey(storeId) });

  const save = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const fd = new FormData(form);
      await createBlock({
        storeId,
        professionalId: professionalId === "all" ? null : professionalId,
        reason: String(fd.get("reason") ?? ""),
        recurring,
        weekday: Number(weekday),
        startTime: String(fd.get("startTime") ?? ""),
        endTime: String(fd.get("endTime") ?? ""),
        startsAt: fd.get("startsAt") ? new Date(String(fd.get("startsAt"))).toISOString() : undefined,
        endsAt: fd.get("endsAt") ? new Date(String(fd.get("endsAt"))).toISOString() : undefined,
      });
      form.reset();
    },
    onSuccess: () => {
      toast.success("Bloqueio criado.");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteBlock(id),
    onSuccess: () => {
      toast.success("Bloqueio removido.");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const professionalName = (id: string | null) =>
    id ? (professionals.data ?? []).find((item) => item.id === id)?.name ?? "Profissional" : "Toda a equipe";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo bloqueio</CardTitle>
          <CardDescription>
            Use folga recorrente para almoço e folga semanal; use período para férias e imprevistos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(event.currentTarget);
            }}
          >
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={recurring} onCheckedChange={setRecurring} />
              Folga recorrente (toda semana)
            </label>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label>Profissional</Label>
                <Select value={professionalId} onValueChange={setProfessionalId}>
                  <SelectTrigger aria-label="Profissional do bloqueio">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toda a equipe</SelectItem>
                    {(professionals.data ?? []).map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {recurring ? (
                <>
                  <div>
                    <Label>Dia da semana</Label>
                    <Select value={weekday} onValueChange={setWeekday}>
                      <SelectTrigger aria-label="Dia da semana">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAYS.map((day) => (
                          <SelectItem key={day.value} value={String(day.value)}>
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="startTime">Início</Label>
                    <Input id="startTime" name="startTime" type="time" defaultValue="12:00" required />
                  </div>
                  <div>
                    <Label htmlFor="endTime">Fim</Label>
                    <Input id="endTime" name="endTime" type="time" defaultValue="13:00" required />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label htmlFor="startsAt">Começa em</Label>
                    <Input id="startsAt" name="startsAt" type="datetime-local" required />
                  </div>
                  <div>
                    <Label htmlFor="endsAt">Termina em</Label>
                    <Input id="endsAt" name="endsAt" type="datetime-local" required />
                  </div>
                </>
              )}

              <div>
                <Label htmlFor="reason">Motivo</Label>
                <Input id="reason" name="reason" placeholder="Almoço, férias, folga..." />
              </div>
            </div>

            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Salvando..." : "Criar bloqueio"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {blocks.isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : (blocks.data ?? []).length === 0 ? (
        <EmptyState title="Nenhum bloqueio" description="A agenda está livre em todos os horários de trabalho." />
      ) : (
        <div className="space-y-2">
          {(blocks.data ?? []).map((block) => (
            <Card key={block.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                <div>
                  <p className="font-medium text-foreground">{professionalName(block.professional_id)}</p>
                  <p className="text-sm text-muted-foreground">{blockLabel(block)}</p>
                  {block.reason ? <p className="text-xs text-muted-foreground">{block.reason}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{block.is_recurring ? "Recorrente" : "Período"}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remover bloqueio"
                    onClick={() => remove.mutate(block.id)}
                  >
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
