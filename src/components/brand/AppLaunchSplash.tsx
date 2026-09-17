import { useEffect, useState } from "react";

import { fetchPlatformBranding } from "@/lib/platform-branding";

const SPLASH_DURATION_MS = 700;
const SPLASH_EXIT_MS = 180;

export function AppLaunchSplash() {
  const [phase, setPhase] = useState<"checking" | "visible" | "leaving" | "hidden">(
    "checking",
  );
  const [platformIcon, setPlatformIcon] = useState<string | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const url = new URL(window.location.href);
    const isMerchantAppEntry =
      url.pathname.startsWith("/painel") ||
      (url.pathname === "/auth" &&
        url.searchParams.get("origem") === "app" &&
        url.searchParams.get("perfil") === "lojista");

    const isExplicitMerchantAppEntry =
      url.pathname === "/auth" &&
      url.searchParams.get("origem") === "app" &&
      url.searchParams.get("perfil") === "lojista";

    if ((!standalone && !isExplicitMerchantAppEntry) || !isMerchantAppEntry) {
      setPhase("hidden");
      return;
    }

    setPhase("visible");
    const exitTimer = window.setTimeout(() => setPhase("leaving"), SPLASH_DURATION_MS);
    const removeTimer = window.setTimeout(
      () => setPhase("hidden"),
      SPLASH_DURATION_MS + SPLASH_EXIT_MS,
    );
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  useEffect(() => {
    if (phase === "hidden") return;
    let active = true;
    void fetchPlatformBranding()
      .then((branding) => {
        if (active) setPlatformIcon(branding.pwaIconUrl);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [phase]);

  if (phase === "checking" || phase === "hidden") return null;

  return (
    <div
      className="app-launch-splash"
      data-visible={phase === "visible" ? "true" : "false"}
      aria-hidden="true"
    >
      <div className="app-launch-splash__glow" />
      <img
        src={platformIcon ?? "/pedium-app-icon-512.png"}
        alt=""
        className="app-launch-splash__icon"
        fetchPriority="high"
      />
    </div>
  );
}
