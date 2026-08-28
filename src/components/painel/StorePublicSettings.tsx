import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { DeliveryAreasEditor } from "@/components/store/DeliveryAreasEditor";
import { OpeningHoursEditor } from "@/components/store/OpeningHoursEditor";
import { PaymentMethodsEditor } from "@/components/store/PaymentMethodsEditor";
import { SlugField, type SlugStatus } from "@/components/store/SlugField";
import { StoreShareCard } from "@/components/store/StoreShareCard";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  AVAILABILITY_LABEL,
  parseDeliveryAreas,
  parseHolidays,
  parseOpeningHours,
  parsePaymentMethods,
  storeAvailability,
  type AvailabilityStatus,
  type DayHours,
  type DeliveryArea,
  type DeliveryMode,
  type Holiday,
  type PaymentMethods,
  type StoreRow,
} from "@/lib/store-config";
import { storePublicUrl } from "@/lib/store-url";

export interface StorePublicSettingsProps {
  store: StoreRow;
  editable: boolean;
  onSaved: () => Promise<unknown> | void;
}

/** Endereço público, publicação, horários, pagamentos e entrega da loja. */
export function StorePublicSettings({ store, editable, onSaved }: StorePublicSettingsProps) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [slug, setSlug] = useState(store.slug);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [confirmSlug, setConfirmSlug] = useState(false);


  const [hours, setHours] = useState<DayHours[]>(parseOpeningHours(store.opening_hours));
  const [holidays, setHolidays] = useState<Holiday[]>(parseHolidays(store.holidays));
  const [payments, setPayments] = useState<PaymentMethods>(parsePaymentMethods(store.payment_methods));
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>((store.delivery_mode as DeliveryMode) ?? "fixed");
  const [deliveryAreas, setDeliveryAreas] = useState<DeliveryArea[]>(parseDeliveryAreas(store.delivery_areas));
  const [baseFee, setBaseFee] = useState(Number(store.delivery_fee));

  const availability = storeAvailability(store);

  async function update(patch: Record<string, unknown>, successMessage: string) {
    setSaving(true);
    try {
      const { error } = await supabase.from("stores").update(patch as never).eq("id", store.id);
      if (error) throw new Error(error.message);
      await queryClient.invalidateQueries({ queryKey: ["my-stores"] });
      await onSaved();
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function applySlug() {
    setConfirmSlug(false);
    const previous = store.slug;
    await update({ slug }, "Endereço atualizado.");
    await supabase.from("audit_logs").insert({
      store_id: store.id,
      action: "update",
      entity: "store_slug",
      entity_id: store.id,
      metadata: { from: previous, to: slug },
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Endereço público</CardTitle>
          <CardDescription>
            Sua loja atende em <strong className="text-foreground">{storePublicUrl(store.slug)}</strong>. Ao alterar,
            o endereço antigo continua redirecionando para o novo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset disabled={!editable} className="space-y-4">
            <SlugField value={slug} onChange={setSlug} storeId={store.id} onStatusChange={setSlugStatus} />
            <Button
              type="button"
              disabled={saving || slug === store.slug || slugStatus !== "available"}
              onClick={() => setConfirmSlug(true)}
            >
              Alterar endereço
            </Button>
          </fieldset>
        </CardContent>
      </Card>

      <StoreShareCard key={`${store.slug}:${store.is_published}`} slug={store.slug} storeName={store.name} isPublished={store.is_published} />

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Publicação e disponibilidade</CardTitle>
          <CardDescription>{availability.message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <Label htmlFor="loja-publicada">Loja publicada</Label>
            <Switch
              id="loja-publicada"
              checked={store.is_published}
              disabled={!editable || saving}
              onCheckedChange={(checked) =>
                void update({ is_published: checked }, checked ? "Loja publicada." : "Loja despublicada.")
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="situacao">Situação do atendimento</Label>
            <Select
              value={store.availability_status}
              disabled={!editable || saving}
              onValueChange={(value) =>
                void update(
                  {
                    availability_status: value,
                    paused_until: value === "paused" ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() : null,
                  },
                  "Situação atualizada.",
                )
              }
            >
              <SelectTrigger id="situacao">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(AVAILABILITY_LABEL) as AvailabilityStatus[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {AVAILABILITY_LABEL[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">A pausa temporária dura 2 horas e depois libera sozinha.</p>
          </div>
        </CardContent>
      </Card>




      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Horários de funcionamento</CardTitle>
          <CardDescription>Dias, horários, pausas e feriados.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset disabled={!editable}>
            <OpeningHoursEditor hours={hours} onChange={setHours} holidays={holidays} onHolidaysChange={setHolidays} />
          </fieldset>
          <Button
            type="button"
            disabled={!editable || saving}
            onClick={() => void update({ opening_hours: hours, holidays }, "Horários atualizados.")}
          >
            Salvar horários
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Formas de recebimento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset disabled={!editable}>
            <PaymentMethodsEditor value={payments} onChange={setPayments} />
          </fieldset>
          <Button
            type="button"
            disabled={!editable || saving}
            onClick={() => void update({ payment_methods: payments }, "Formas de recebimento atualizadas.")}
          >
            Salvar pagamentos
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Áreas e taxas de entrega</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset disabled={!editable}>
            <DeliveryAreasEditor
              mode={deliveryMode}
              onModeChange={setDeliveryMode}
              areas={deliveryAreas}
              onAreasChange={setDeliveryAreas}
              baseFee={baseFee}
              onBaseFeeChange={setBaseFee}
            />
          </fieldset>
          <Button
            type="button"
            disabled={!editable || saving}
            onClick={() =>
              void update(
                { delivery_mode: deliveryMode, delivery_areas: deliveryAreas, delivery_fee: baseFee },
                "Entrega atualizada.",
              )
            }
          >
            Salvar entrega
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={confirmSlug} onOpenChange={setConfirmSlug}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar o endereço da loja?</AlertDialogTitle>
            <AlertDialogDescription>
              O endereço passará de {storePublicUrl(store.slug)} para {storePublicUrl(slug)}. Links e QR Codes antigos
              continuarão funcionando por redirecionamento, mas recomendamos gerar um novo QR Code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void applySlug()}>Confirmar alteração</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
