import { BellRing, CalendarClock, Clock3, Send, TestTube2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PUSH_AUDIENCES, PUSH_SCHEDULES, type PushAudienceType, type PushScheduleType } from "@/lib/push-campaigns";

export interface PushCampaignDraft {
  name: string; title: string; body: string; audienceType: PushAudienceType; inactiveDays: number;
  scheduleType: PushScheduleType; scheduledAt: string | null; recurrenceDays: number[]; recurrenceTime: string;
  frequencyCapHours: number; action: "draft" | "schedule" | "send_now";
}
export interface PushCampaignEditorProps { busy: boolean; onSave: (draft: PushCampaignDraft) => void; onTest: (content: { title: string; body: string }) => void }
const DAYS = [{ value: 0, label: "Dom" }, { value: 1, label: "Seg" }, { value: 2, label: "Ter" }, { value: 3, label: "Qua" }, { value: 4, label: "Qui" }, { value: 5, label: "Sex" }, { value: 6, label: "Sáb" }];

export function PushCampaignEditor({ busy, onSave, onTest }: PushCampaignEditorProps) {
  const [title, setTitle] = useState(""); const [body, setBody] = useState("");
  const [audienceType, setAudienceType] = useState<PushAudienceType>("all");
  const [scheduleType, setScheduleType] = useState<PushScheduleType>("now");
  const [days, setDays] = useState<number[]>([]);

  function readForm(event: FormEvent<HTMLFormElement>, action: PushCampaignDraft["action"]) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    onSave({ name: String(form.get("name") ?? ""), title, body, audienceType,
      inactiveDays: Number(form.get("inactive_days") ?? 60), scheduleType,
      scheduledAt: String(form.get("scheduled_at") ?? "") ? new Date(String(form.get("scheduled_at"))).toISOString() : null,
      recurrenceDays: days, recurrenceTime: String(form.get("recurrence_time") ?? "10:00"),
      frequencyCapHours: Number(form.get("frequency_cap") ?? 24), action });
  }

  return <Card className="rounded-lg">
    <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BellRing className="size-5 text-primary" />Nova notificação</CardTitle></CardHeader>
    <CardContent><form className="grid gap-5" onSubmit={(event) => readForm(event, scheduleType === "now" ? "send_now" : "schedule")}>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="push-name">Nome interno</Label><Input id="push-name" name="name" maxLength={80} placeholder="Ex.: Oferta de sexta" required /></div>
      <div className="space-y-2"><Label>Público</Label><Select value={audienceType} onValueChange={(value) => setAudienceType(value as PushAudienceType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PUSH_AUDIENCES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div></div>
      {audienceType === "inactive" ? <div className="space-y-2"><Label htmlFor="inactive-days">Sem comprar há quantos dias?</Label><Input id="inactive-days" name="inactive_days" type="number" min={7} max={365} defaultValue={60} /></div> : null}
      <div className="space-y-2"><div className="flex justify-between"><Label htmlFor="push-title">Título</Label><span className="text-xs text-muted-foreground">{title.length}/80</span></div><Input id="push-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="Uma novidade para você" required /></div>
      <div className="space-y-2"><div className="flex justify-between"><Label htmlFor="push-body">Mensagem</Label><span className="text-xs text-muted-foreground">{body.length}/240</span></div><Textarea id="push-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={240} rows={4} placeholder="Escreva uma mensagem curta e direta." required /></div>
      <div className="rounded-lg border border-border bg-muted/40 p-4"><p className="text-xs font-medium uppercase text-muted-foreground">Prévia</p><div className="mt-3 flex gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><BellRing className="size-4" /></span><div><p className="text-sm font-semibold">{title || "Título da notificação"}</p><p className="text-sm text-muted-foreground">{body || "Sua mensagem aparecerá aqui."}</p></div></div></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Quando enviar</Label><Select value={scheduleType} onValueChange={(value) => setScheduleType(value as PushScheduleType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PUSH_SCHEDULES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="frequency-cap">Intervalo mínimo por cliente</Label><Select name="frequency_cap" defaultValue="24"><SelectTrigger id="frequency-cap"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="12">12 horas</SelectItem><SelectItem value="24">24 horas</SelectItem><SelectItem value="48">48 horas</SelectItem><SelectItem value="168">7 dias</SelectItem></SelectContent></Select></div></div>
      {scheduleType === "scheduled" ? <div className="space-y-2"><Label htmlFor="scheduled-at">Data e hora da loja</Label><Input id="scheduled-at" name="scheduled_at" type="datetime-local" required /></div> : null}
      {scheduleType === "recurring" ? <div className="grid gap-3"><Label>Dias e horário</Label><div className="flex flex-wrap gap-2">{DAYS.map((day) => <Button key={day.value} type="button" size="sm" variant={days.includes(day.value) ? "default" : "outline"} onClick={() => setDays((current) => current.includes(day.value) ? current.filter((item) => item !== day.value) : [...current, day.value])}>{day.label}</Button>)}</div><Input name="recurrence_time" type="time" defaultValue="10:00" className="max-w-40" /></div> : null}
      {scheduleType === "automatic" ? <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">O envio acontecerá automaticamente quando o cliente entrar no público escolhido.</p> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={busy || !title || !body} onClick={() => onTest({ title, body })}><TestTube2 className="mr-2 size-4" />Enviar teste</Button><Button type="button" variant="secondary" disabled={busy} onClick={(event) => readForm({ ...event, preventDefault: () => undefined, currentTarget: event.currentTarget.closest("form") as HTMLFormElement } as unknown as FormEvent<HTMLFormElement>, "draft")}><Clock3 className="mr-2 size-4" />Salvar rascunho</Button><Button type="submit" disabled={busy}><Send className="mr-2 size-4" />{scheduleType === "now" ? "Enviar agora" : <><CalendarClock className="mr-2 size-4" />Programar</>}</Button></div>
    </form></CardContent>
  </Card>;
}
