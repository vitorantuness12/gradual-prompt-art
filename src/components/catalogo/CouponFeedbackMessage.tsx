import { AlertCircle, BadgePercent, CalendarClock, CircleOff, ShoppingCart, TicketX } from "lucide-react";

import type { CouponFeedback } from "@/hooks/useCartCoupon";

/** Título curto por motivo de recusa — a mensagem detalhada vem do servidor. */
const REASON_LABELS: Record<NonNullable<CouponFeedback["reason"]>, string> = {
  not_found: "Cupom não encontrado",
  inactive: "Cupom desativado",
  not_started: "Cupom ainda não vale",
  expired: "Cupom expirado",
  usage_limit: "Cupom esgotado",
  min_order: "Pedido mínimo não atingido",
};

function ReasonIcon({ reason }: { reason: NonNullable<CouponFeedback["reason"]> }) {
  const className = "mt-0.5 h-4 w-4 shrink-0";
  switch (reason) {
    case "expired":
    case "not_started":
      return <CalendarClock className={className} aria-hidden />;
    case "usage_limit":
    case "inactive":
      return <CircleOff className={className} aria-hidden />;
    case "min_order":
      return <ShoppingCart className={className} aria-hidden />;
    case "not_found":
      return <TicketX className={className} aria-hidden />;
    default:
      return <AlertCircle className={className} aria-hidden />;
  }
}

/**
 * Feedback do cupom compartilhado entre carrinho e checkout.
 * Erros mostram o motivo classificado + mensagem específica do servidor.
 */
export function CouponFeedbackMessage({ feedback }: { feedback: CouponFeedback }) {
  if (feedback.kind === "success") {
    return (
      <p className="flex items-start gap-1.5 text-sm font-medium text-success" role="status">
        <BadgePercent className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{feedback.message}</span>
      </p>
    );
  }
  const title = feedback.reason ? REASON_LABELS[feedback.reason] : null;
  return (
    <div className="flex items-start gap-1.5 text-sm text-destructive" role="alert" aria-live="polite">
      {feedback.reason ? (
        <ReasonIcon reason={feedback.reason} />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      )}
      <p>
        {title ? <span className="font-semibold">{title}: </span> : null}
        <span className="font-medium">{feedback.message}</span>
      </p>
    </div>
  );
}
