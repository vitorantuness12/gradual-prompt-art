import type { Database } from "@/integrations/supabase/types";

export type CourierRow = Database["public"]["Tables"]["couriers"]["Row"];
export type DeliveryZoneRow = Database["public"]["Tables"]["delivery_zones"]["Row"];
export type DeliveryRow = Database["public"]["Tables"]["deliveries"]["Row"];

export const VEHICLE_LABEL: Record<string, string> = {
  moto: "Moto",
  bike: "Bicicleta",
  carro: "Carro",
  a_pe: "A pé",
  van: "Van",
};

export const ZONE_RULE_LABEL: Record<string, string> = {
  district: "Bairro",
  zip: "Faixa de CEP",
  distance: "Faixa de distância",
  weight: "Peso máximo",
};

export const DELIVERY_STATUS_LABEL: Record<string, string> = {
  assigned: "Atribuída",
  picked_up: "A caminho",
  delivered: "Entregue",
  failed: "Ocorrência",
};

export const DELIVERY_EVENT_LABEL: Record<string, string> = {
  assigned: "Atribuída ao entregador",
  accepted: "Aceita pelo entregador",
  started: "Rota iniciada",
  delivered: "Entregue",
  attempt_failed: "Tentativa sem sucesso",
  incident: "Ocorrência registrada",
  cancelled: "Entrega cancelada",
};

export interface FeeContext {
  district?: string | null;
  zip?: string | null;
  distanceKm?: number | null;
  weightGrams?: number | null;
  subtotal: number;
}

export interface FeeResult {
  fee: number;
  etaMinutes: number;
  zone: DeliveryZoneRow | null;
  blockedReason: string | null;
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

/** Encontra a regra de taxa aplicável ao endereço/pedido informado. */
export function resolveDeliveryFee(zones: DeliveryZoneRow[], context: FeeContext, fallbackFee = 0): FeeResult {
  const active = zones.filter((zone) => zone.is_active).sort((a, b) => a.sort_order - b.sort_order);

  const match = active.find((zone) => {
    if (zone.rule_type === "district") {
      return (
        Boolean(context.district) &&
        (zone.district ?? "").trim().toLowerCase() === (context.district ?? "").trim().toLowerCase()
      );
    }
    if (zone.rule_type === "zip") {
      const zip = onlyDigits(context.zip ?? "");
      if (zip.length < 8) return false;
      const start = onlyDigits(zone.zip_start ?? "");
      const end = onlyDigits(zone.zip_end ?? "") || start;
      return Boolean(start) && zip >= start && zip <= end;
    }
    if (zone.rule_type === "distance") {
      const km = context.distanceKm;
      if (km === null || km === undefined) return false;
      return km >= Number(zone.distance_min_km) && (zone.distance_max_km === null || km <= Number(zone.distance_max_km));
    }
    if (zone.rule_type === "weight") {
      const grams = context.weightGrams ?? 0;
      return zone.weight_max_grams !== null && grams <= zone.weight_max_grams;
    }
    return false;
  });

  if (!match) {
    return { fee: fallbackFee, etaMinutes: 40, zone: null, blockedReason: null };
  }

  const blocked =
    context.subtotal < Number(match.min_order_value)
      ? `Pedido mínimo de R$ ${Number(match.min_order_value).toFixed(2).replace(".", ",")} para ${match.label}.`
      : null;

  const free = match.free_above !== null && context.subtotal >= Number(match.free_above);

  return {
    fee: free ? 0 : Number(match.fee),
    etaMinutes: match.eta_minutes,
    zone: match,
    blockedReason: blocked,
  };
}

/** Um pedido é considerado atrasado quando passa do prazo previsto. */
export function isLate(dueAt: string | null): boolean {
  if (!dueAt) return false;
  return new Date(dueAt).getTime() < Date.now();
}

export function elapsedMinutes(from: string | null | undefined): number {
  if (!from) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 60_000));
}
