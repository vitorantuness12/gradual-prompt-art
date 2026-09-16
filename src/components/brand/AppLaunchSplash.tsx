import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { fetchPlatformBranding, platformBrandingQueryKey } from "@/lib/platform-branding";

const SPLASH_DURATION_MS = 1200;
const SPLASH_EXIT_MS = 500;

/**
 * Tela de abertura automática exibida ao carregar o aplicativo.
 * Utiliza o ícone PWA configurado na identidade visual.
 */
export function AppLaunchSplash() {
  const { data: branding } = useQuery({
    queryKey: platformBrandingQueryKey,
    queryFn: fetchPlatformBranding,
    staleTime: 5 * 60_000,
  });
  
  const [phase, setPhase] = useState<"visible" | "leaving" | "hidden">("visible");

  useEffect(() => {
    // Inicia a saída após a duração inicial
    const exitTimer = window.setTimeout(() => setPhase("leaving"), SPLASH_DURATION_MS);
    // Remove do DOM após a animação de saída
    const removeTimer = window.setTimeout(() => setPhase("hidden"), SPLASH_DURATION_MS + SPLASH_EXIT_MS);
    
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-background ${
        phase === "leaving" ? "animate-splash-exit" : ""
      }`}
      aria-hidden="true"
    >
      <div className="relative flex flex-col items-center">
        {/* Efeito de brilho ao fundo do ícone */}
        <div className="absolute inset-0 -z-10 animate-pulse-glow rounded-full bg-primary/20 blur-3xl" />
        
        <img
          src={branding?.pwaIconUrl ?? "/app-icon-512.png"}
          alt=""
          className="size-24 animate-splash-pulse object-contain sm:size-32"
          fetchPriority="high"
        />
      </div>
    </div>
  );
}
