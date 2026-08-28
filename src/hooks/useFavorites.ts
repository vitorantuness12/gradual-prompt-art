import { useCallback, useEffect, useState } from "react";

const PREFIX = "seu-pedido:favorites:";

function key(slug: string) {
  return `${PREFIX}${slug}`;
}

/** Favoritos do cliente, guardados por loja no próprio navegador. */
export function useFavorites(slug: string) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key(slug));
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      setIds(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
    } catch {
      setIds([]);
    }
  }, [slug]);

  const toggle = useCallback(
    (productId: string) => {
      setIds((current) => {
        const next = current.includes(productId)
          ? current.filter((id) => id !== productId)
          : [...current, productId];
        if (typeof window !== "undefined") window.localStorage.setItem(key(slug), JSON.stringify(next));
        return next;
      });
    },
    [slug],
  );

  const has = useCallback((productId: string) => ids.includes(productId), [ids]);

  return { ids, has, toggle };
}
