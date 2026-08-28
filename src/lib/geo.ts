import type { DeliveryZoneRow } from "@/lib/delivery";

export interface LatLng {
  lat: number;
  lng: number;
}

/** Distância em linha reta entre dois pontos (fórmula de Haversine). */
export function haversineKm(from: LatLng, to: LatLng): number {
  const R = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Distância aproximada de rota: ruas não são retas, então aplicamos um fator
 * de sinuosidade comum em malhas urbanas brasileiras (~1,35x).
 */
export const ROUTE_FACTOR = 1.35;

export function routeDistanceKm(from: LatLng, to: LatLng): number {
  return Math.round(haversineKm(from, to) * ROUTE_FACTOR * 100) / 100;
}

/** Tempo estimado de entrega: preparo + deslocamento na velocidade média urbana. */
export function estimateEtaMinutes(distanceKm: number, prepMinutes = 15, avgSpeedKmh = 22): number {
  const travel = (distanceKm / avgSpeedKmh) * 60;
  return Math.max(prepMinutes, Math.round(prepMinutes + travel));
}

export function formatKm(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1).replace(".", ",")} km`;
}

/** Aplica taxa por km e taxa mínima sobre a faixa encontrada. */
export function zoneFeeForDistance(zone: DeliveryZoneRow, distanceKm: number | null): number {
  const perKm = Number(zone.price_per_km ?? 0);
  const base = Number(zone.fee ?? 0);
  const variable = perKm > 0 && distanceKm !== null ? perKm * distanceKm : 0;
  const total = base + variable;
  return Math.max(Number(zone.min_fee ?? 0), Math.round(total * 100) / 100);
}

export interface QuoteContext {
  district?: string | null;
  zip?: string | null;
  distanceKm?: number | null;
  weightGrams?: number | null;
  subtotal: number;
}

export interface DeliveryQuote {
  fee: number;
  etaMinutes: number;
  distanceKm: number | null;
  zone: DeliveryZoneRow | null;
  blockedReason: string | null;
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function zoneMatches(zone: DeliveryZoneRow, context: QuoteContext): boolean {
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
}

/**
 * Calcula o frete final considerando faixa por bairro/CEP/distância/peso,
 * taxa por km, taxa mínima, pedido mínimo e frete grátis acima de um valor.
 */
export function quoteDelivery(
  zones: DeliveryZoneRow[],
  context: QuoteContext,
  fallbackFee = 0,
): DeliveryQuote {
  const distanceKm = context.distanceKm ?? null;
  const active = zones.filter((zone) => zone.is_active).sort((a, b) => a.sort_order - b.sort_order);
  const match = active.find((zone) => zoneMatches(zone, context)) ?? null;

  if (!match) {
    const outOfRange =
      distanceKm !== null && active.some((zone) => zone.rule_type === "distance");
    return {
      fee: fallbackFee,
      etaMinutes: distanceKm !== null ? estimateEtaMinutes(distanceKm) : 40,
      distanceKm,
      zone: null,
      blockedReason: outOfRange
        ? "Este endereço está fora das áreas de entrega configuradas pela loja."
        : null,
    };
  }

  const blocked =
    context.subtotal < Number(match.min_order_value)
      ? `Pedido mínimo de R$ ${Number(match.min_order_value).toFixed(2).replace(".", ",")} para ${match.label}.`
      : null;

  const free = match.free_above !== null && context.subtotal >= Number(match.free_above);

  return {
    fee: free ? 0 : zoneFeeForDistance(match, distanceKm),
    etaMinutes: match.eta_minutes,
    distanceKm,
    zone: match,
    blockedReason: blocked,
  };
}

/** Link de rota (origem → destino) no OpenStreetMap — gratuito, sem chave. */
export function routeUrl(origin: LatLng | string | null, destination: LatLng | string): string {
  if (typeof destination === "string") return mapSearchUrl(destination);
  const from = origin && typeof origin !== "string" ? `${origin.lat},${origin.lng}` : "";
  const to = `${destination.lat},${destination.lng}`;
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${from}%3B${to}`;
}

/** Busca de endereço no OpenStreetMap (sem chave de API). */
export function mapSearchUrl(address: string): string {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`;
}



/** Mapa estático (OpenStreetMap) para pré-visualizar o destino sem chave de API. */
export function staticMapEmbed(point: LatLng, zoomDelta = 0.01): string {
  const bbox = [
    point.lng - zoomDelta,
    point.lat - zoomDelta,
    point.lng + zoomDelta,
    point.lat + zoomDelta,
  ].join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${point.lat}%2C${point.lng}`;
}

export interface PriorityInput {
  createdAt: string;
  dueAt?: string | null;
  distanceKm?: number | null;
  status?: string;
}

/**
 * Score de prioridade: pedidos atrasados vêm primeiro, depois os mais antigos,
 * e entre iguais os mais próximos (rota mais curta sai antes).
 */
export function priorityScore(input: PriorityInput): number {
  const now = Date.now();
  const waiting = Math.max(0, (now - new Date(input.createdAt).getTime()) / 60_000);
  const lateBy = input.dueAt ? (now - new Date(input.dueAt).getTime()) / 60_000 : 0;
  const distancePenalty = (input.distanceKm ?? 3) * 2;
  return waiting + Math.max(0, lateBy) * 3 - distancePenalty;
}

export function sortByPriority<T extends PriorityInput>(items: T[]): T[] {
  return [...items].sort((a, b) => priorityScore(b) - priorityScore(a));
}
