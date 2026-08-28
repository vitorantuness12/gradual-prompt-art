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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploadField } from "@/components/store/ImageUploadField";
import {
  addRecordPhoto,
  deleteRecord,
  deleteRecordPhoto,
  fetchRecords,
  recordHistory,
  recordsKey,
  saveRecord,
  type Appointment,
} from "@/lib/agenda";
import { formatDateTime } from "@/lib/format";

/** Ficha do cliente: anamnese, alergias, histórico e fotos antes/depois. */
export function RecordsTab({ storeId, appointments }: { storeId: string; appointments: Appointment[] }) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const records = useQuery({ queryKey: recordsKey(storeId), queryFn: () => fetchRecords(storeId) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: recordsKey(storeId) });

  const create = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const fd = new FormData(form);
      await saveRecord({
        storeId,
        customerName: String(fd.get("customerName") ?? ""),
        customerPhone: String(fd.get("customerPhone") ?? ""),
        allergies: String(fd.get("allergies") ?? ""),
        anamnesis: String(fd.get("anamnesis") ?? ""),
        notes: String(fd.get("notes") ?? ""),
      });
      form.reset();
    },
    onSuccess: () => {
      toast.success("Ficha salva.");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteRecord(id),
    onSuccess: () => {
      toast.success("Ficha removida.");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addPhoto = useMutation({
    mutationFn: (input: { recordId: string; kind: "before" | "after"; imageUrl: string }) =>
      addRecordPhoto({ storeId, recordId: input.recordId, kind: input.kind, imageUrl: input.imageUrl, caption: "" }),
    onSuccess: () => {
      toast.success("Foto adicionada.");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removePhoto = useMutation({
    mutationFn: (id: string) => deleteRecordPhoto(id),
    onSuccess: () => void refresh(),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova ficha</CardTitle>
          <CardDescription>Guarde anamnese, alergias e observações do atendimento.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate(event.currentTarget);
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
              <Label htmlFor="allergies">Alergias</Label>
              <Input id="allergies" name="allergies" placeholder="Ex.: látex, ácido salicílico" />
            </div>
            <div>
              <Label htmlFor="notes">Observações</Label>
              <Input id="notes" name="notes" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="anamnesis">Anamnese</Label>
              <Textarea id="anamnesis" name="anamnesis" rows={3} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Salvando..." : "Salvar ficha"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {records.isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : (records.data ?? []).length === 0 ? (
        <EmptyState title="Nenhuma ficha" description="Crie a ficha do cliente para acompanhar a evolução." />
      ) : (
        <div className="space-y-2">
          {(records.data ?? []).map((record) => {
            const open = openId === record.id;
            const history = recordHistory(record, appointments);
            return (
              <Card key={record.id}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{record.customer_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {record.customer_phone ?? "sem telefone"} · {history.length} atendimento(s)
                      </p>
                      {record.allergies ? (
                        <Badge variant="destructive" className="mt-1">
                          Alergias: {record.allergies}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setOpenId(open ? null : record.id)}>
                        {open ? "Fechar" : "Abrir ficha"}
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Remover ficha" onClick={() => remove.mutate(record.id)}>
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  {open ? (
                    <div className="space-y-4 border-t border-border pt-3">
                      {record.anamnesis ? (
                        <p className="text-sm text-muted-foreground whitespace-pre-line">{record.anamnesis}</p>
                      ) : null}
                      {record.notes ? <p className="text-sm text-muted-foreground">Obs.: {record.notes}</p> : null}

                      <div>
                        <p className="mb-2 text-sm font-medium text-foreground">Histórico de atendimentos</p>
                        {history.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Ainda sem atendimentos registrados.</p>
                        ) : (
                          <ul className="divide-y divide-border text-sm">
                            {history.slice(0, 10).map((appointment) => (
                              <li key={appointment.id} className="flex justify-between py-1.5">
                                <span>{formatDateTime(appointment.starts_at)}</span>
                                <span className="text-muted-foreground">{appointment.status}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <ImageUploadField
                          storeId={storeId}
                          kind="cover"
                          label="Foto antes"
                          value={null}
                          onChange={(url) => url && addPhoto.mutate({ recordId: record.id, kind: "before", imageUrl: url })}
                        />
                        <ImageUploadField
                          storeId={storeId}
                          kind="cover"
                          label="Foto depois"
                          value={null}
                          onChange={(url) => url && addPhoto.mutate({ recordId: record.id, kind: "after", imageUrl: url })}
                        />
                      </div>

                      {record.photos.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                          {record.photos.map((photo) => (
                            <figure key={photo.id} className="relative">
                              <img
                                src={photo.image_url}
                                alt={`Foto ${photo.kind === "before" ? "antes" : "depois"} de ${record.customer_name}`}
                                className="aspect-square w-full rounded-lg object-cover"
                                loading="lazy"
                              />
                              <figcaption className="mt-1 text-center text-[11px] text-muted-foreground">
                                {photo.kind === "before" ? "Antes" : "Depois"}
                              </figcaption>
                              <button
                                type="button"
                                aria-label="Remover foto"
                                className="absolute right-1 top-1 rounded-full bg-background/80 p-1"
                                onClick={() => removePhoto.mutate(photo.id)}
                              >
                                <Trash2 className="size-3" aria-hidden="true" />
                              </button>
                            </figure>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
