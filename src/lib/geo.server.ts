/**
 * Geocodificação de endereços (endereço → coordenadas) sem depender de chave
 * de API: usa o CEP da BrasilAPI e, como reserva, o Nominatim/OpenStreetMap.
 * Toda consulta bem-sucedida vai para o cache no banco (`geocode_cache`).
 */

import type { LatLng } from "@/lib/geo";

export interface AddressInput {
  zip?: string | null | undefined;
  street?: string | null | undefined;
  number?: string | null | undefined;
  district?: string | null | undefined;
  city?: string | null | undefined;
  state?: string | null | undefined;
}

export interface GeocodeResult extends LatLng {
  provider: string;
  label: string | null;
}

function digits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

export function addressLabel(address: AddressInput): string {
  return [
    [address.street, address.number].filter(Boolean).join(", "),
    address.district,
    address.city,
    address.state,
    digits(address.zip) || null,
    "Brasil",
  ]
    .filter((part) => Boolean(part && String(part).trim()))
    .join(" - ");
}

function cacheKey(address: AddressInput): string {
  return addressLabel(address).toLowerCase().replace(/\s+/g, " ").slice(0, 300);
}

async function fromBrasilApi(zip: string): Promise<GeocodeResult | null> {
  try {
    const response = await fetch(`https://brasilapi.com.br/api/v2/cep/${zip}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      location?: { coordinates?: { latitude?: string; longitude?: string } };
      street?: string;
      neighborhood?: string;
      city?: string;
    };
    const lat = Number(data.location?.coordinates?.latitude);
    const lng = Number(data.location?.coordinates?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
    return {
      lat,
      lng,
      provider: "brasilapi",
      label: [data.street, data.neighborhood, data.city].filter(Boolean).join(", ") || null,
    };
  } catch {
    return null;
  }
}

async function fromNominatim(query: string): Promise<GeocodeResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "OSeuPedido/1.0 (entregas)" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
    const first = data[0];
    if (!first) return null;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, provider: "nominatim", label: first.display_name ?? null };
  } catch {
    return null;
  }
}

/** Resolve coordenadas com cache no banco. Retorna null quando não encontra. */
export async function geocodeAddress(address: AddressInput): Promise<GeocodeResult | null> {
  const key = cacheKey(address);
  if (!key || key === "brasil") return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: cached } = await supabaseAdmin
    .from("geocode_cache")
    .select("latitude, longitude, provider, label")
    .eq("query_key", key)
    .maybeSingle();

  if (cached) {
    return {
      lat: Number(cached.latitude),
      lng: Number(cached.longitude),
      provider: cached.provider,
      label: cached.label,
    };
  }

  const zip = digits(address.zip);
  const hasStreet = Boolean(address.street && String(address.street).trim());

  let result: GeocodeResult | null = null;
  if (hasStreet) result = await fromNominatim(addressLabel(address));
  if (!result && zip.length === 8) result = await fromBrasilApi(zip);
  if (!result && zip.length === 8) result = await fromNominatim(`${zip}, Brasil`);
  if (!result && address.district && address.city) {
    result = await fromNominatim(`${address.district}, ${address.city}, Brasil`);
  }
  if (!result) return null;

  await supabaseAdmin.from("geocode_cache").upsert(
    {
      query_key: key,
      latitude: result.lat,
      longitude: result.lng,
      provider: result.provider,
      label: result.label,
    },
    { onConflict: "query_key" },
  );

  return result;
}
