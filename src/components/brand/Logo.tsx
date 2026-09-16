import { cn } from "@/lib/utils";
import logo from "@/assets/pedium-logo.png.asset.json";
import { useQuery } from "@tanstack/react-query";
import { useAppTheme } from "@/hooks/useAppTheme";
import { fetchPlatformBranding, platformBrandingQueryKey, resolvePlatformLogo } from "@/lib/platform-branding";

export interface LogoProps {
  className?: string;
  /** Exibe o nome completo da marca (logo por extenso). */
  withWordmark?: boolean;
  /** Mantido por compatibilidade: a marca já possui contraste próprio. */
  inverted?: boolean;
  context?: "sales" | "merchant" | "platform";
}

/**
 * Marca da plataforma Pedi Um.
 */
export function Logo({ className, withWordmark = true, inverted = false, context = "platform" }: LogoProps) {
  const { theme } = useAppTheme();
  const { data } = useQuery({ queryKey: platformBrandingQueryKey, queryFn: fetchPlatformBranding, staleTime: 5 * 60_000 });
  const configured = resolvePlatformLogo(data, context, theme);
  return (
    <span className={cn("inline-flex items-center", className)}>
      <img
        src={configured ?? logo.url}
        alt="Pedi Um — Tudo em um"
        className={cn(
          "w-auto object-contain",
          withWordmark ? "h-9" : "h-8",
          inverted && !configured && "brightness-0 invert",
        )}
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}
