/**
 * Cálculo de rota real (distância + tempo) entre dois pontos — 100% gratuito,
 * sem chave de API: usa o OSRM público (dados OpenStreetMap) e, se ele estiver
 * indisponível, cai para o cálculo Haversine com fator de sinuosidade urbana.
 */
import { estimateEtaMinutes, haversineKm, routeDistanceKm, type LatLng } from "@/lib/geo";

export interface RouteResult {
  distanceKm: number;
  durationMinutes: number;
  provider: "osrm" | "estimado";
  geometry: LatLng[];
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

async function fromOsrm(origin: LatLng, destination: LatLng, host: string): Promise<RouteResult | null> {
  try {
    const url =
      `${host}/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}` +
      `?overview=simplified&geometries=geojson`;
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      code?: string;
      routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates?: [number, number][] } }>;
    };
    const route = body.routes?.[0];
    if (body.code !== "Ok" || !route?.distance) return null;
    return {
      distanceKm: round(route.distance / 1000),
      durationMinutes: Math.max(1, Math.round((route.duration ?? 0) / 60)),
      provider: "osrm",
      geometry: (route.geometry?.coordinates ?? []).map(([lng, lat]) => ({ lat, lng })),
    };
  } catch {
    return null;
  }
}

/** Servidores OSRM públicos e gratuitos (o segundo é reserva). */
const OSRM_HOSTS = ["https://router.project-osrm.org", "https://routing.openstreetmap.de/routed-car"];

/** Rota entre dois pontos, sempre com resultado (cai para estimativa offline). */
export async function routeBetween(origin: LatLng, destination: LatLng): Promise<RouteResult> {
  // Pontos praticamente iguais: não vale chamar serviço externo.
  if (haversineKm(origin, destination) < 0.05) {
    return { distanceKm: 0, durationMinutes: 15, provider: "estimado", geometry: [origin, destination] };
  }

  for (const host of OSRM_HOSTS) {
    const result = await fromOsrm(origin, destination, host);
    if (result) return result;
  }

  const distanceKm = routeDistanceKm(origin, destination);
  return {
    distanceKm,
    durationMinutes: estimateEtaMinutes(distanceKm),
    provider: "estimado",
    geometry: [origin, destination],
  };
}
