import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import type { DeliveryZoneRow } from "@/lib/delivery";
import { quoteDelivery, estimateEtaMinutes, type LatLng } from "@/lib/geo";

export interface DeliveryEstimateInput {
  storeSlug: string;
  zip?: string;
  street?: string;
  number?: string;
  district?: string;
  city?: string;
  state?: string;
  subtotal: number;
}

export interface DeliveryEstimate {
  ok: boolean;
  message: string | null;
  distanceKm: number | null;
  fee: number;
  etaMinutes: number;
  zoneLabel: string | null;
  blockedReason: string | null;
  destination: LatLng | null;
  origin: LatLng | null;
  /** Traçado da rota (quando o provedor devolve). */
  geometry: LatLng[];
  /** osrm | estimado (OpenStreetMap, sem chave de API) */
  routeProvider: string | null;
}


/**
 * Estima distância, prazo e frete de um endereço até a loja.
 * Endpoint público (usado no checkout antes de existir pedido).
 */
export const estimateDelivery = createServerFn({ method: "POST" })
  .inputValidator((input: DeliveryEstimateInput) => input)
  .handler(async ({ data }): Promise<DeliveryEstimate> => {
    const { clientIdentifier, consumeRateLimit } = await import("@/lib/security.server");
    const identifier = clientIdentifier(getRequest()?.headers);
    const limit = await consumeRateLimit("tracking", `frete:${identifier}`);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { geocodeAddress } = await import("@/lib/geo.server");

    const { data: store } = await supabaseAdmin
      .from("stores")
      .select(
        "id, delivery_fee, latitude, longitude, address_street, address_number, address_district, address_city, address_state, address_zip",
      )
      .eq("slug", data.storeSlug)
      .maybeSingle();

    if (!store) {
      return {
        ok: false,
        message: "Loja não encontrada.",
        distanceKm: null,
        fee: 0,
        etaMinutes: 40,
        zoneLabel: null,
        blockedReason: null,
        destination: null,
        origin: null,
        geometry: [],
        routeProvider: null,
      };
    }

    const { data: zoneRows } = await supabaseAdmin
      .from("delivery_zones")
      .select("*")
      .eq("store_id", store.id)
      .order("sort_order");
    const zones = (zoneRows ?? []) as DeliveryZoneRow[];

    // Coordenadas da loja: geocodificadas uma vez e guardadas no cadastro.
    let origin: LatLng | null =
      store.latitude !== null && store.longitude !== null
        ? { lat: Number(store.latitude), lng: Number(store.longitude) }
        : null;

    if (!origin && limit.allowed) {
      const geocoded = await geocodeAddress({
        zip: store.address_zip,
        street: store.address_street,
        number: store.address_number,
        district: store.address_district,
        city: store.address_city,
        state: store.address_state,
      });
      if (geocoded) {
        origin = { lat: geocoded.lat, lng: geocoded.lng };
        await supabaseAdmin
          .from("stores")
          .update({ latitude: geocoded.lat, longitude: geocoded.lng })
          .eq("id", store.id);
      }
    }

    let destination: LatLng | null = null;
    if (limit.allowed) {
      const geocoded = await geocodeAddress({
        zip: data.zip,
        street: data.street,
        number: data.number,
        district: data.district,
        city: data.city ?? store.address_city,
        state: data.state ?? store.address_state,
      });
      if (geocoded) destination = { lat: geocoded.lat, lng: geocoded.lng };
    }

    // Rota real (Google/Mapbox/OSRM) com queda para estimativa offline.
    let distanceKm: number | null = null;
    let routeMinutes: number | null = null;
    let geometry: LatLng[] = [];
    let routeProvider: string | null = null;

    if (origin && destination) {
      const { routeBetween } = await import("@/lib/routing.server");
      const route = await routeBetween(origin, destination);
      distanceKm = route.distanceKm;
      routeMinutes = route.durationMinutes;
      geometry = route.geometry;
      routeProvider = route.provider;
    }

    const quote = quoteDelivery(
      zones,
      {
        district: data.district ?? null,
        zip: data.zip ?? null,
        distanceKm,
        subtotal: data.subtotal,
      },
      Number(store.delivery_fee ?? 0),
    );

    const travelEta = routeMinutes !== null ? routeMinutes + 15 : null;

    return {
      ok: true,
      message:
        distanceKm === null
          ? "Não conseguimos localizar o endereço no mapa; usamos a taxa configurada pela loja."
          : null,
      distanceKm,
      fee: quote.fee,
      etaMinutes:
        travelEta !== null
          ? Math.max(quote.etaMinutes, travelEta)
          : distanceKm !== null
            ? Math.max(quote.etaMinutes, estimateEtaMinutes(distanceKm))
            : quote.etaMinutes,
      zoneLabel: quote.zone?.label ?? null,
      blockedReason: quote.blockedReason,
      destination,
      origin,
      geometry,
      routeProvider,
    };
  });

export interface OrderRoute {
  orderId: string;
  distanceKm: number | null;
  durationMinutes: number | null;
  provider: string | null;
  origin: LatLng | null;
  destination: LatLng | null;
  geometry: LatLng[];
}

/**
 * Calcula (e guarda) a rota da loja até o endereço do pedido.
 * Geocodifica o endereço quando o pedido ainda não tem coordenadas.
 */
export const routeForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data, context }): Promise<OrderRoute> => {
    const empty: OrderRoute = {
      orderId: data.orderId,
      distanceKm: null,
      durationMinutes: null,
      provider: null,
      origin: null,
      destination: null,
      geometry: [],
    };

    // RLS garante que o usuário só enxerga pedidos das lojas dele.
    const { data: order } = await context.supabase
      .from("orders")
      .select("id, store_id, address, delivery_lat, delivery_lng, distance_km")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return empty;

    const { data: store } = await context.supabase
      .from("stores")
      .select(
        "id, latitude, longitude, address_street, address_number, address_district, address_city, address_state, address_zip",
      )
      .eq("id", order.store_id)
      .maybeSingle();
    if (!store) return empty;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { geocodeAddress } = await import("@/lib/geo.server");
    const { routeBetween } = await import("@/lib/routing.server");

    let origin: LatLng | null =
      store.latitude !== null && store.longitude !== null
        ? { lat: Number(store.latitude), lng: Number(store.longitude) }
        : null;
    if (!origin) {
      const geocoded = await geocodeAddress({
        zip: store.address_zip,
        street: store.address_street,
        number: store.address_number,
        district: store.address_district,
        city: store.address_city,
        state: store.address_state,
      });
      if (geocoded) {
        origin = { lat: geocoded.lat, lng: geocoded.lng };
        await supabaseAdmin.from("stores").update({ latitude: origin.lat, longitude: origin.lng }).eq("id", store.id);
      }
    }

    let destination: LatLng | null =
      order.delivery_lat !== null && order.delivery_lng !== null
        ? { lat: Number(order.delivery_lat), lng: Number(order.delivery_lng) }
        : null;

    if (!destination) {
      const address = (order.address ?? {}) as Record<string, string | undefined>;
      const geocoded = await geocodeAddress({
        zip: address["zip"] ?? address["cep"],
        street: address["street"],
        number: address["number"],
        district: address["district"],
        city: address["city"] ?? store.address_city,
        state: address["state"] ?? store.address_state,
      });
      if (geocoded) destination = { lat: geocoded.lat, lng: geocoded.lng };
    }

    if (!origin || !destination) return { ...empty, origin, destination };

    const route = await routeBetween(origin, destination);

    await supabaseAdmin
      .from("orders")
      .update({
        delivery_lat: destination.lat,
        delivery_lng: destination.lng,
        distance_km: route.distanceKm,
      })
      .eq("id", order.id);

    return {
      orderId: order.id,
      distanceKm: route.distanceKm,
      durationMinutes: route.durationMinutes,
      provider: route.provider,
      origin,
      destination,
      geometry: route.geometry,
    };
  });
