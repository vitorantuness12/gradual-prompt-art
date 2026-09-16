import { Link } from "@tanstack/react-router";
import { Home, Search, ShoppingBag, UserRound, UtensilsCrossed } from "lucide-react";

import { Button } from "@/components/ui/button";

interface StoreMobileNavProps {
  slug: string;
  cartCount: number;
  onSearch: () => void;
  onCart: () => void;
}

export function StoreMobileNav({ slug, cartCount, onSearch, onCart }: StoreMobileNavProps) {
  const itemClass = "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium text-muted-foreground transition-colors active:scale-95";

  return (
    <nav
      aria-label="Navegação da loja"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-xl sm:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        <Link to="/$slug" params={{ slug }} aria-current="page" className={`${itemClass} text-primary`}>
          <Home className="size-5" aria-hidden="true" />
          Início
        </Link>
        <Button type="button" variant="ghost" onClick={onSearch} className={`${itemClass} h-auto shadow-none`}>
          <Search className="size-5" aria-hidden="true" />
          Buscar
        </Button>
        <Button type="button" variant="ghost" onClick={onCart} className={`${itemClass} relative h-auto shadow-none`}>
          <span className="relative">
            <ShoppingBag className="size-5" aria-hidden="true" />
            {cartCount > 0 ? (
              <span className="absolute -right-3 -top-2 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {cartCount > 9 ? "9+" : cartCount}
              </span>
            ) : null}
          </span>
          Sacola
        </Button>
        <Link to="/$slug/acompanhar" params={{ slug }} search={{ codigo: undefined }} className={itemClass}>
          <UtensilsCrossed className="size-5" aria-hidden="true" />
          Pedidos
        </Link>
        <Link to="/meus-pedidos" className={itemClass}>
          <UserRound className="size-5" aria-hidden="true" />
          Conta
        </Link>
      </div>
    </nav>
  );
}