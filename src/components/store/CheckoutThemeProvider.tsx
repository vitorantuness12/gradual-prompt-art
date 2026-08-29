import { useEffect, type CSSProperties, type ReactNode } from "react";

import { defaultThemeConfig, paletteFromPrimary, themeCssVars, type StoreThemeConfig } from "@/lib/store-theme";

/**
 * Tema padrão do checkout e do acompanhamento de pedido.
 *
 * Diferente da vitrine da loja, estas páginas NÃO seguem as cores do lojista:
 * usam sempre a paleta neutra clara com destaque verde, para manter o fluxo de
 * pagamento com aparência previsível e confiável em qualquer loja.
 */
const CHECKOUT_GREEN = "#16a34a";

/** Paleta fixa (neutro claro + verde). */
export const checkoutThemeConfig: StoreThemeConfig = (() => {
  const base = defaultThemeConfig();
  return {
    ...base,
    typography: { ...base.typography, font: "inter" },
    layout: { ...base.layout, radius: 14, shadow: "soft", buttonShape: "rounded" },
    colors: {
      ...paletteFromPrimary(CHECKOUT_GREEN),
      background: "#f4f6f8",
      card: "#ffffff",
      text: "#131a22",
      mutedText: "#5f6b7a",
      primary: CHECKOUT_GREEN,
      secondary: "#eef1f5",
      accent: "#0f8a41",
      badge: CHECKOUT_GREEN,
    },
  };
})();

export function CheckoutThemeProvider({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const background = checkoutThemeConfig.colors.background;

  useEffect(() => {
    const previous = document.body.style.backgroundColor;
    document.body.style.backgroundColor = background;
    return () => {
      document.body.style.backgroundColor = previous;
    };
  }, [background]);

  const style = {
    ...(themeCssVars(checkoutThemeConfig) as CSSProperties),
    fontFamily: "var(--store-font)",
    colorScheme: "light",
  } as CSSProperties;

  return (
    <div className={className} style={style} data-checkout-theme>
      {children}
    </div>
  );
}
