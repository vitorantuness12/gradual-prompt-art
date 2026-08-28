import { CalendarClock, Trash2, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CatalogData } from "@/hooks/useCatalog";
import { formatDateTime } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

interface ScheduleManagerProps {
  storeId: string;
  catalog: CatalogData;
  onChanged: () => void;
}

/** Profissionais, bloqueios de agenda e feriados — base para evitar conflito de horários. */
export function ScheduleManager({ storeId, catalog, onChanged }: ScheduleManagerProps) {
  const [saving, setSaving] = useState(false);

  async function addProfessional(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (name.length < 2) {
      toast.error("Informe o nome do profissional.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("professionals").insert({
      store_id: storeId,
      name,
      role_title: String(form.get("role") ?? "").trim() || null,
      phone: String(form.get("phone") ?? "").trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    event.currentTarget.reset();
    toast.success("Profissional cadastrado.");
    onChanged();
  }

  async function removeProfessional(id: string, name: string) {
    if (!window.confirm(`Remover ${name} da equipe?`)) return;
    const { error } = await supabase.from("professionals").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    onChanged();
  }

  async function addBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startsAt = String(form.get("startsAt") ?? "");
    const endsAt = String(form.get("endsAt") ?? "");
    if (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
      toast.error("O fim do bloqueio precisa ser depois do início.");
      return;
    }
    const professionalId = String(form.get("professionalId") ?? "all");

    setSaving(true);
    const { error } = await supabase.from("schedule_blocks").insert({
      store_id: storeId,
      professional_id: professionalId === "all" ? null : professionalId,
      reason: String(form.get("reason") ?? "").trim() || null,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    event.currentTarget.reset();
    toast.success("Bloqueio criado.");
    onChanged();
  }

  async function removeBlock(id: string) {
    const { error } = await supabase.from("schedule_blocks").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    onChanged();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Profissionais</CardTitle>
          <CardDescription>Quem executa os serviços agendados pelos clientes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={addProfessional} className="grid gap-3 sm:grid-cols-3" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="professional-name">Nome</Label>
              <Input id="professional-name" name="name" required maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="professional-role">Função</Label>
              <Input id="professional-role" name="role" maxLength={60} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="professional-phone">Telefone</Label>
              <Input id="professional-phone" name="phone" maxLength={20} />
            </div>
            <Button type="submit" disabled={saving} className="sm:col-span-3">
              <UserPlus className="mr-2 size-4" aria-hidden="true" /> Adicionar profissional
            </Button>
          </form>

          <ul className="space-y-2">
            {catalog.professionals.length === 0 ? (
              <li className="text-sm text-muted-foreground">Nenhum profissional cadastrado.</li>
            ) : (
              catalog.professionals.map((professional) => {
                const services = catalog.productProfessionals.filter(
                  (link) => link.professional_id === professional.id,
                ).length;
                return (
                  <li
                    key={professional.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 px-3 py-2"
                  >
                    <span className="font-medium text-foreground">{professional.name}</span>
                    {professional.role_title ? (
                      <span className="text-xs text-muted-foreground">{professional.role_title}</span>
                    ) : null}
                    <Badge variant="secondary">{services} serviço(s)</Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="ml-auto text-destructive hover:text-destructive"
                      aria-label={`Remover ${professional.name}`}
                      onClick={() => void removeProfessional(professional.id, professional.name)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </li>
                );
              })
            )}
          </ul>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Bloqueios e feriados</CardTitle>
          <CardDescription>Períodos em que a agenda não aceita novos horários.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={addBlock} className="grid gap-3 sm:grid-cols-2" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="block-start">Início</Label>
              <Input id="block-start" name="startsAt" type="datetime-local" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="block-end">Fim</Label>
              <Input id="block-end" name="endsAt" type="datetime-local" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="block-professional">Profissional</Label>
              <Select name="professionalId" defaultValue="all">
                <SelectTrigger id="block-professional">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toda a loja</SelectItem>
                  {catalog.professionals.map((professional) => (
                    <SelectItem key={professional.id} value={professional.id}>
                      {professional.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="block-reason">Motivo</Label>
              <Input id="block-reason" name="reason" maxLength={80} placeholder="Feriado, folga, manutenção..." />
            </div>
            <Button type="submit" disabled={saving} className="sm:col-span-2">
              <CalendarClock className="mr-2 size-4" aria-hidden="true" /> Criar bloqueio
            </Button>
          </form>

          <ul className="space-y-2">
            {catalog.blocks.length === 0 ? (
              <li className="text-sm text-muted-foreground">Nenhum bloqueio cadastrado.</li>
            ) : (
              catalog.blocks.map((block) => (
                <li
                  key={block.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm"
                >
                  <span className="text-foreground">
                    {formatDateTime(block.starts_at)} → {formatDateTime(block.ends_at)}
                  </span>
                  {block.reason ? <span className="text-muted-foreground">{block.reason}</span> : null}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="ml-auto text-destructive hover:text-destructive"
                    aria-label="Remover bloqueio"
                    onClick={() => void removeBlock(block.id)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
