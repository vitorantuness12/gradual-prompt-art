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

  useEffect(() => {
    const exitTimer = window.setTimeout(() => setPhase("leaving"), SPLASH_DURATION_MS);
    const removeTimer = window.setTimeout(() => setPhase("hidden"), SPLASH_DURATION_MS + SPLASH_EXIT_MS);
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(removeTimer);
    };
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
        src={branding?.pwaIconUrl ?? "/app-icon-512.png"}
        alt=""
        className="app-launch-splash__icon"
        fetchPriority="high"
      />
    </div>
  );
}
