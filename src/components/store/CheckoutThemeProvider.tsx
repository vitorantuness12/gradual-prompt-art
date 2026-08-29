import { useEffect, type CSSProperties, type ReactNode } from "react";

import { CHECKOUT_PALETTE, checkoutExtraCssVars, checkoutThemeConfig } from "@/lib/checkout-theme";
import { themeCssVars } from "@/lib/store-theme";

/**
 * Aplica o tema padrão (neutro claro + verde) no carrinho, checkout e
 * acompanhamento de pedido. A paleta vem de `@/lib/checkout-theme`.
 */
export function CheckoutThemeProvider({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const background = CHECKOUT_PALETTE.background;

  useEffect(() => {
    const previous = document.body.style.backgroundColor;
    document.body.style.backgroundColor = background;
    return () => {
      document.body.style.backgroundColor = previous;
    };
  }, [background]);

  const style = {
    ...(themeCssVars(checkoutThemeConfig) as CSSProperties),
    ...(checkoutExtraCssVars as CSSProperties),
    fontFamily: "var(--store-font)",
    colorScheme: "light",
  } as CSSProperties;

  return (
    <div className={className} style={style} data-checkout-theme>
      {children}
    </div>
  );
}
