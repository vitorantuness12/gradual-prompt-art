import { useEffect } from "react";

/**
 * Mostra o nome da loja na aba do navegador do cliente.
 * Ex.: "Cantinho da Praça" ou "Cantinho da Praça — Finalizar pedido".
 */
export function useStoreDocumentTitle(storeName: string | null | undefined, suffix?: string) {
  useEffect(() => {
    if (!storeName) return;
    document.title = suffix ? `${storeName} — ${suffix}` : storeName;
  }, [storeName, suffix]);
}
