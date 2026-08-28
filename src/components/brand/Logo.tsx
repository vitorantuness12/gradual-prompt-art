import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

export interface LogoProps {
  className?: string;
  /** Exibe o nome completo da marca (logo por extenso). */
  withWordmark?: boolean;
  /** Mantido por compatibilidade: a marca já possui contraste próprio. */
  inverted?: boolean;
}

/**
 * Marca da plataforma "O Seu Pedido".
 */
export function Logo({ className, withWordmark = true, inverted = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <img
        src={logo}
        alt="O Seu Pedido"
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
