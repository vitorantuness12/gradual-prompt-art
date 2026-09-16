import { cn } from "@/lib/utils";
import logo from "@/assets/pedium-logo.png.asset.json";

export interface LogoProps {
  className?: string;
  /** Exibe o nome completo da marca (logo por extenso). */
  withWordmark?: boolean;
  /** Mantido por compatibilidade: a marca já possui contraste próprio. */
  inverted?: boolean;
}

/**
 * Marca da plataforma Pedium.
 */
export function Logo({ className, withWordmark = true, inverted = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <img
        src={logo.url}
        alt="Pedium — Tudo em um"
        className={cn(
          "w-auto object-contain",
          withWordmark ? "h-9" : "h-8",
          inverted && "brightness-0 invert",
        )}
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}
