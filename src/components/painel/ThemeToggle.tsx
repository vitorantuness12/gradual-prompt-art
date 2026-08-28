import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppTheme } from "@/hooks/useAppTheme";

/** Botão de fundo claro/escuro usado no topo do painel. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useAppTheme();
  const isDark = theme === "dark";
  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      onClick={toggle}
      aria-label={isDark ? "Usar fundo claro" : "Usar fundo escuro"}
      title={isDark ? "Fundo claro" : "Fundo escuro"}
    >
      {isDark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
      <span className="ml-2 hidden sm:inline">{isDark ? "Claro" : "Escuro"}</span>
    </Button>
  );
}
