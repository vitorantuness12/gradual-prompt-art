import { useCallback, useEffect, useState } from "react";

/**
 * Tema claro/escuro de todo o sistema.
 *
 * A escolha fica salva no navegador do usuário e é aplicada na tag <html>
 * pela classe `dark`, usada pelos tokens de cor do design system.
 */
export type AppTheme = "light" | "dark";

const STORAGE_KEY = "osp:tema";
const listeners = new Set<(theme: AppTheme) => void>();
let current: AppTheme = "dark";

function apply(theme: AppTheme) {
  if (typeof document === "undefined") return;
  // O tema base do sistema é escuro; a classe .light aplica a paleta clara.
  document.documentElement.classList.toggle("light", theme === "light");
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function readStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return "dark";
}

export function setAppTheme(theme: AppTheme) {
  current = theme;
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, theme);
  apply(theme);
  listeners.forEach((listener) => listener(theme));
}

export function useAppTheme() {
  const [theme, setTheme] = useState<AppTheme>(current);

  // Hidratação: só lemos o navegador depois da montagem para não divergir do SSR.
  useEffect(() => {
    const stored = readStoredTheme();
    current = stored;
    apply(stored);
    setTheme(stored);
    listeners.add(setTheme);
    return () => {
      listeners.delete(setTheme);
    };
  }, []);

  const toggle = useCallback(() => setAppTheme(current === "dark" ? "light" : "dark"), []);

  return { theme, setTheme: setAppTheme, toggle };
}
