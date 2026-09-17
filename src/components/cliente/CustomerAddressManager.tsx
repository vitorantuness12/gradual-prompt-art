import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Home, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteMyAddress,
  saveMyAddress,
  setMyDefaultAddress,
  type MySavedAddress,
} from "@/lib/contas.functions";
import { maskZip } from "@/lib/masks";

interface AddressDraft {
  id?: string;
  label: string;
  street: string;
  number: string;
  complement: string;
  reference: string;
  district: string;
  city: string;
  state: string;
  zipCode: string;
  makeDefault: boolean;
}
const EMPTY_ADDRESS: AddressDraft = {
  label: "Casa",
  street: "",
  number: "",
  complement: "",
  reference: "",
  district: "",
  city: "",
  state: "",
  zipCode: "",
  makeDefault: false,
};

export function CustomerAddressManager({ addresses }: { addresses: MySavedAddress[] }) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveMyAddress);
  const setDefault = useServerFn(setMyDefaultAddress);
  const remove = useServerFn(deleteMyAddress);
  const [draft, setDraft] = useState<AddressDraft | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["customer-dashboard"] });
  const saveMutation = useMutation({
    mutationFn: (value: AddressDraft) => save({ data: value }),
    onSuccess: () => {
      toast.success("Endereço salvo.");
      setDraft(null);
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const defaultMutation = useMutation({
    mutationFn: (id: string) => setDefault({ data: { id } }),
    onSuccess: () => {
      toast.success("Endereço principal atualizado.");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Endereço excluído.");
      setDeleteId(null);
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const edit = (item: MySavedAddress) =>
    setDraft({
      id: item.id,
      label: item.label,
      street: item.street,
      number: item.number ?? "",
      complement: item.complement ?? "",
      reference: item.reference ?? "",
      district: item.district ?? "",
      city: item.city,
      state: item.state ?? "",
      zipCode: item.zipCode ? maskZip(item.zipCode) : "",
      makeDefault: item.isDefault,
    });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft) saveMutation.mutate(draft);
  };
  const field = (key: keyof AddressDraft, value: string | boolean) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Endereços salvos</h2>
          <p className="text-sm text-muted-foreground">Escolha rapidamente no próximo pedido.</p>
        </div>
        <Button
          size="sm"
          onClick={() => setDraft({ ...EMPTY_ADDRESS, makeDefault: addresses.length === 0 })}
        >
          <Plus className="mr-1.5 size-4" aria-hidden="true" />
          Adicionar
        </Button>
      </div>
      {addresses.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-5 py-10 text-center">
          <MapPin className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-medium">Nenhum endereço salvo</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre um endereço para agilizar suas próximas compras.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {addresses.map((item) => (
            <Card key={item.id} className="rounded-lg shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-semibold">
                      <MapPin className="size-4 text-primary" aria-hidden="true" />
                      {item.label}
                      {item.isDefault ? <Badge variant="secondary">Principal</Badge> : null}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {item.street}
                      {item.number ? `, ${item.number}` : ""}
                      {item.complement ? ` · ${item.complement}` : ""}
                      <br />
                      {item.district ? `${item.district} · ` : ""}
                      {item.city}
                      {item.state ? `/${item.state}` : ""}
                      {item.zipCode ? ` · CEP ${maskZip(item.zipCode)}` : ""}
                      {item.reference ? (
                        <>
                          <br />
                          Referência: {item.reference}
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                  {!item.isDefault ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => defaultMutation.mutate(item.id)}
                    >
                      <Home className="mr-1.5 size-4" aria-hidden="true" />
                      Tornar principal
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={() => edit(item)}>
                    <Pencil className="mr-1.5 size-4" aria-hidden="true" />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Excluir endereço ${item.label}`}
                    onClick={() => setDeleteId(item.id)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(draft)}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Editar endereço" : "Novo endereço"}</DialogTitle>
            <DialogDescription>
              Esses dados ficarão disponíveis nos próximos pedidos.
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="address-label">Nome do endereço</Label>
                <Input
                  id="address-label"
                  value={draft.label}
                  onChange={(event) => field("label", event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address-zip">CEP</Label>
                <Input
                  id="address-zip"
                  value={draft.zipCode}
                  onChange={(event) => field("zipCode", maskZip(event.target.value))}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="address-street">Rua</Label>
                <Input
                  id="address-street"
                  value={draft.street}
                  onChange={(event) => field("street", event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address-number">Número</Label>
                <Input
                  id="address-number"
                  value={draft.number}
                  onChange={(event) => field("number", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address-complement">Complemento</Label>
                <Input
                  id="address-complement"
                  value={draft.complement}
                  onChange={(event) => field("complement", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address-district">Bairro</Label>
                <Input
                  id="address-district"
                  value={draft.district}
                  onChange={(event) => field("district", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address-city">Cidade</Label>
                <Input
                  id="address-city"
                  value={draft.city}
                  onChange={(event) => field("city", event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address-state">Estado</Label>
                <Input
                  id="address-state"
                  value={draft.state}
                  onChange={(event) => field("state", event.target.value)}
                  maxLength={2}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="address-reference">Ponto de referência</Label>
                <Input
                  id="address-reference"
                  value={draft.reference}
                  onChange={(event) => field("reference", event.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox
                  checked={draft.makeDefault}
                  onCheckedChange={(checked) => field("makeDefault", checked === true)}
                />
                Usar como endereço principal
              </label>
              <DialogFooter className="sm:col-span-2">
                <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Salvando..." : "Salvar endereço"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este endereço?</AlertDialogTitle>
            <AlertDialogDescription>
              Ele deixará de aparecer como opção nos próximos pedidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) deleteMutation.mutate(deleteId);
              }}
            >
              Excluir endereço
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
