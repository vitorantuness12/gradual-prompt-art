import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { fetchPlatformBranding, platformBrandingQueryKey } from "@/lib/platform-branding";

const SPLASH_DURATION_MS = 700;
const SPLASH_EXIT_MS = 180;

export function AppLaunchSplash() {
  const { data: branding } = useQuery({
    queryKey: platformBrandingQueryKey,
    queryFn: fetchPlatformBranding,
    staleTime: 5 * 60_000,
  });
  const [phase, setPhase] = useState<"visible" | "leaving" | "hidden">("visible");
  const [storeIcon, setStoreIcon] = useState<string | null>(null);

  useEffect(() => {
    const exitTimer = window.setTimeout(() => setPhase("leaving"), SPLASH_DURATION_MS);
    const removeTimer = window.setTimeout(() => setPhase("hidden"), SPLASH_DURATION_MS + SPLASH_EXIT_MS);
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const slug = window.location.pathname.split("/").filter(Boolean)[0];
    if (!standalone || !slug || slug === "auth" || slug === "painel") return;

    const controller = new AbortController();
    void fetch(`/api/public/manifest?loja=${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ icons?: { src?: string; purpose?: string }[] }> : null)
      .then((manifest) => {
        const icon = manifest?.icons?.find((item) => item.purpose === "any")?.src;
        if (icon) setStoreIcon(icon);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      className="app-launch-splash"
      data-visible={phase === "visible" ? "true" : "false"}
      aria-hidden="true"
    >
      <div className="app-launch-splash__glow" />
      <img
        src={storeIcon ?? branding?.pwaIconUrl ?? "/pedium-app-icon-512.png"}
        alt=""
        className="app-launch-splash__icon"
        fetchPriority="high"
      />
    </div>
  );
}
