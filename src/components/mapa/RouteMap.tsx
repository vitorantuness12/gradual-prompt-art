import { useEffect, useRef } from "react";

import type { LatLng } from "@/lib/geo";
import { cn } from "@/lib/utils";

interface RouteMapProps {
  origin?: LatLng | null;
  destination?: LatLng | null;
  /** Traçado da rota; quando vazio, liga origem e destino em linha reta. */
  geometry?: LatLng[];
  className?: string;
}

/**
 * Mapa com o traçado da rota (OpenStreetMap + Leaflet), carregado só no
 * navegador para não quebrar a renderização no servidor.
 */
export function RouteMap({ origin, destination, geometry, className }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    const node = containerRef.current;
    if (!node || (!origin && !destination)) return;

    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current) return;

      const map =
        (mapRef.current as L.Map | null) ??
        L.map(containerRef.current, { attributionControl: false, zoomControl: true });
      mapRef.current = map;

      map.eachLayer((layer) => map.removeLayer(layer));
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

      const path = (geometry && geometry.length > 1 ? geometry : [origin, destination]).filter(
        Boolean,
      ) as LatLng[];
      const points = path.map((point) => [point.lat, point.lng] as [number, number]);

      if (points.length > 1) {
        L.polyline(points, { color: "#e11d48", weight: 5, opacity: 0.85 }).addTo(map);
      }

      const dot = (color: string) =>
        L.divIcon({
          className: "",
          html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 0 0 2px rgba(0,0,0,.2)"></span>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

      if (origin) L.marker([origin.lat, origin.lng], { icon: dot("#0f172a") }).addTo(map).bindTooltip("Loja");
      if (destination) {
        L.marker([destination.lat, destination.lng], { icon: dot("#e11d48") }).addTo(map).bindTooltip("Entrega");
      }

      if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [24, 24] });
      else if (points[0]) map.setView(points[0], 15);

      setTimeout(() => map.invalidateSize(), 50);
    })();

    return () => {
      cancelled = true;
    };
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, geometry]);

  useEffect(
    () => () => {
      const map = mapRef.current as { remove?: () => void } | null;
      map?.remove?.();
      mapRef.current = null;
    },
    [],
  );

  if (!origin && !destination) return null;

  return <div ref={containerRef} className={cn("h-56 w-full overflow-hidden rounded-xl border border-border/60", className)} />;
}
