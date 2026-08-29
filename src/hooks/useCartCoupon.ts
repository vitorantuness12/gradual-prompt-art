import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { validateCoupon } from "@/lib/orders.functions";

/** Cupom aplicado pelo cliente, compartilhado entre o carrinho e o checkout. */
export interface AppliedCoupon {
  code: string;
  discount: number;
  /** Subtotal usado no cálculo — permite revalidar quando o carrinho muda. */
  subtotal: number;
  storeId: string | null;
}

const PREFIX = "seu-pedido:coupon:";

function couponKey(slug: string) {
  return `${PREFIX}${slug}`;
}

/** Lê o cupom salvo daquela loja; descarta o registro se pertencer a outra loja. */
export function readCoupon(slug: string, storeId?: string | null): AppliedCoupon | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(couponKey(slug));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AppliedCoupon;
    if (!parsed?.code) return null;
    if (storeId && parsed.storeId && parsed.storeId !== storeId) {
      window.localStorage.removeItem(couponKey(slug));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearStoredCoupon(slug: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(couponKey(slug));
}

function writeCoupon(slug: string, coupon: AppliedCoupon) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(couponKey(slug), JSON.stringify(coupon));
}

export interface CouponFeedback {
  kind: "success" | "error";
  message: string;
  /** Classifica a recusa para a UI destacar o motivo (expirado, mínimo etc.). */
  reason?: "not_found" | "inactive" | "not_started" | "expired" | "usage_limit" | "min_order";
}

/**
 * Cupom persistido por loja no navegador.
 * O desconto é sempre calculado no servidor; o valor guardado aqui serve apenas
 * para manter carrinho e checkout mostrando exatamente o mesmo resultado.
 * Quando o subtotal muda, o cupom é revalidado automaticamente.
 */
export function useCartCoupon(slug: string, storeId: string | null, subtotal: number, ready: boolean) {
  const checkCoupon = useServerFn(validateCoupon);
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<CouponFeedback | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const lastChecked = useRef<string | null>(null);

  useEffect(() => {
    setCoupon(readCoupon(slug, storeId));
    setHydrated(true);
  }, [slug, storeId]);

  /** Valida no servidor e guarda (ou limpa) o cupom. Devolve o resultado para a UI. */
  const apply = useCallback(
    async (rawCode: string): Promise<CouponFeedback> => {
      const code = rawCode.trim().toUpperCase();
      if (code.length < 2) {
        const result: CouponFeedback = { kind: "error", message: "Digite um cupom válido." };
        setFeedback(result);
        return result;
      }
      setChecking(true);
      try {
        const response = await checkCoupon({ data: { storeSlug: slug, code, subtotal } });
        if (response.ok && response.code) {
          const applied: AppliedCoupon = {
            code: response.code,
            discount: response.discount ?? 0,
            subtotal,
            storeId,
          };
          setCoupon(applied);
          writeCoupon(slug, applied);
          lastChecked.current = `${applied.code}:${subtotal}`;
          const result: CouponFeedback = { kind: "success", message: response.message };
          setFeedback(result);
          return result;
        }
        setCoupon(null);
        clearStoredCoupon(slug);
        const result: CouponFeedback = { kind: "error", message: response.message };
        setFeedback(result);
        return result;
      } catch {
        const result: CouponFeedback = {
          kind: "error",
          message: "Não foi possível validar o cupom agora.",
        };
        setFeedback(result);
        return result;
      } finally {
        setChecking(false);
      }
    },
    [checkCoupon, slug, storeId, subtotal],
  );

  const clear = useCallback(() => {
    setCoupon(null);
    setFeedback(null);
    lastChecked.current = null;
    clearStoredCoupon(slug);
  }, [slug]);

  // Revalida quando o subtotal muda (item adicionado/removido em qualquer tela).
  useEffect(() => {
    if (!ready || !hydrated || !coupon || checking) return;
    if (coupon.subtotal === subtotal) return;
    const signature = `${coupon.code}:${subtotal}`;
    if (lastChecked.current === signature) return;
    lastChecked.current = signature;
    void apply(coupon.code);
  }, [apply, checking, coupon, hydrated, ready, subtotal]);

  const discount = coupon ? Math.min(coupon.discount, subtotal) : 0;

  return { coupon, discount, checking, feedback, hydrated, apply, clear };
}
