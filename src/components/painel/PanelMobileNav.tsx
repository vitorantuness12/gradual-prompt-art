import { Link } from "@tanstack/react-router";
import { CreditCard, LayoutDashboard, Menu, ShoppingBag, Users } from "lucide-react";
import type { ComponentType } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface NavigationItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

interface PanelMobileNavProps {
  pathname: string;
  items: NavigationItem[];
}

const PRIMARY_ITEMS: NavigationItem[] = [
  { to: "/painel", label: "Início", icon: LayoutDashboard },
  { to: "/painel/pedidos", label: "Pedidos", icon: ShoppingBag },
  { to: "/painel/pagamentos", label: "Financeiro", icon: CreditCard },
  { to: "/painel/clientes", label: "Clientes", icon: Users },
];

function isActive(pathname: string, to: string): boolean {
  return to === "/painel" ? pathname === to : pathname.startsWith(to);
}

export function PanelMobileNav({ pathname, items }: PanelMobileNavProps) {
  const primaryPaths = new Set(PRIMARY_ITEMS.map((item) => item.to));
  const secondaryItems = items.filter((item) => !primaryPaths.has(item.to));
  const moreActive = secondaryItems.some((item) => isActive(pathname, item.to));

  return (
    <nav
      aria-label="Navegação principal do painel"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-background/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {PRIMARY_ITEMS.map((item) => {
          const active = isActive(pathname, item.to);
          return (
            <Link
              key={item.to}
              to={item.to as never}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium transition-colors active:scale-95",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className="size-5" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}

        <Sheet>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              aria-label="Abrir mais opções"
              className={cn(
                "h-auto min-h-14 min-w-0 flex-col gap-1 rounded-lg px-1 text-[11px] shadow-none",
                moreActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Menu className="size-5" aria-hidden="true" />
              Mais
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[82dvh] rounded-t-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
            <SheetHeader className="pr-10 text-left">
              <SheetTitle>Mais recursos</SheetTitle>
              <SheetDescription>Acesse todas as áreas liberadas para sua loja.</SheetDescription>
            </SheetHeader>
            <ScrollArea className="mt-4 max-h-[62dvh]">
              <div className="grid grid-cols-2 gap-2 pb-3">
                {secondaryItems.map((item) => {
                  const active = isActive(pathname, item.to);
                  return (
                    <SheetClose asChild key={item.to}>
                      <Link
                        to={item.to as never}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-14 items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm font-medium transition-colors",
                          active ? "border-primary bg-primary/10 text-primary" : "bg-card text-foreground active:bg-secondary",
                        )}
                      >
                        <item.icon className="size-5 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 leading-tight">{item.label}</span>
                      </Link>
                    </SheetClose>
                  );
                })}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}