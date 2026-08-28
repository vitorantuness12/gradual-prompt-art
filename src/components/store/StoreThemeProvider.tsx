import { useEffect, type CSSProperties, type ReactNode } from "react";

import { readableTextOn, themeCssVars, type StoreThemeConfig } from "@/lib/store-theme";

/**
 * Aplica o tema da loja em um trecho da página.
 *
 * As variáveis do design system são redefinidas aqui dentro, então os
 * componentes continuam usando classes semânticas (bg-card, text-foreground)
 * e assumem as cores da loja automaticamente.
 */
export function StoreThemeProvider({
  config,
  children,
  className,
  paintDocument = false,
}: {
  config: StoreThemeConfig;
  children: ReactNode;
  className?: string;
  /** Pinta o fundo da página inteira com a cor da loja (usar só na loja pública). */
  paintDocument?: boolean;
}) {
  const background = config.colors.background;

  // Evita que a cor do app apareça atrás da loja (overscroll, áreas vazias).
  useEffect(() => {
    if (!paintDocument) return;
    const previous = document.body.style.backgroundColor;
    document.body.style.backgroundColor = background;
    return () => {
      document.body.style.backgroundColor = previous;
    };
  }, [paintDocument, background]);

  const style = {
    ...(themeCssVars(config) as CSSProperties),
    fontFamily: "var(--store-font)",
    // Mantém controles nativos (inputs, scrollbars) coerentes com a cor da loja.
    colorScheme: readableTextOn(background) === "#ffffff" ? "dark" : "light",
  } as CSSProperties;

  return (
    <div className={className} style={style} data-store-theme>
      {children}
    </div>
  );
}
