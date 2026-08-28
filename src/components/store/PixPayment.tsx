import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { chargeStatus, createCharge, type ChargeResponse } from "@/lib/payments.functions";
import { formatCurrency } from "@/lib/format";

interface PixPaymentProps {
  storeSlug: string;
  orderCode: string;
  phone: string;
  method: "pix" | "card_online";
  total: number;
  onPaid?: () => void;
}

/** Cobrança online do pedido: QR Code Pix, copia-e-cola e checkout de cartão. */
export function PixPayment({ storeSlug, orderCode, phone, method, total, onPaid }: PixPaymentProps) {
  const charge = useServerFn(createCharge);
  const status = useServerFn(chargeStatus);
  const [result, setResult] = useState<ChargeResponse | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: async () =>
      charge({
        data: {
          storeSlug,
          orderCode,
          phone,
          method,
          ...(typeof window === "undefined" ? {} : { returnUrl: window.location.href }),
        },
      }),
    onSuccess: (response) => {
      setResult(response);
      if (!response.ok) toast.error(response.message);
      if (response.checkoutUrl) window.open(response.checkoutUrl, "_blank", "noopener");
    },
    onError: () => toast.error("Não foi possível gerar a cobrança agora."),
  });

  useEffect(() => {
    if (!result?.pixPayload) return;
    void QRCode.toDataURL(result.pixPayload, { width: 260, margin: 1 }).then(setQrImage).catch(() => setQrImage(null));
  }, [result?.pixPayload]);

  // Confere automaticamente se o pagamento foi confirmado pelo provedor.
  useEffect(() => {
    if (!result?.pixPayload || result.status === "paid") return;
    const timer = window.setInterval(async () => {
      const current = await status({ data: { storeSlug, orderCode, phone } });
      if (current.status === "paid") {
        toast.success("Pagamento confirmado!");
        setResult((old) => (old ? { ...old, status: "paid" } : old));
        onPaid?.();
      }
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [result?.pixPayload, result?.status, status, storeSlug, orderCode, phone, onPaid]);

  async function copyPayload() {
    if (!result?.pixPayload) return;
    await navigator.clipboard.writeText(result.pixPayload);
    toast.success("Código Pix copiado.");
  }

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-base">
          {method === "pix" ? "Pagar com Pix" : "Pagar com cartão"} · {formatCurrency(total)}
        </CardTitle>
        <CardDescription>
          {method === "pix"
            ? "Escaneie o QR Code ou use o código copia-e-cola no aplicativo do seu banco."
            : "Você será levado para o ambiente seguro do provedor de pagamento."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {result?.status === "paid" ? (
          <p className="text-sm font-medium text-success">Pagamento confirmado. Obrigado!</p>
        ) : (
          <>
            {!result ? (
              <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
                {generate.isPending ? "Gerando..." : method === "pix" ? "Gerar QR Code Pix" : "Abrir pagamento"}
              </Button>
            ) : null}

            {qrImage ? (
              <img src={qrImage} alt="QR Code do Pix para pagamento do pedido" className="h-56 w-56 rounded-xl bg-white p-2" />
            ) : null}

            {result?.pixPayload ? (
              <div className="space-y-2">
                <p className="break-all rounded-xl border border-border/70 bg-background p-3 text-xs text-muted-foreground">
                  {result.pixPayload}
                </p>
                <Button variant="outline" size="sm" onClick={copyPayload}>
                  Copiar código Pix
                </Button>
                {result.expiresAt ? (
                  <p className="text-xs text-muted-foreground">
                    Válido até {new Date(result.expiresAt).toLocaleTimeString("pt-BR", { timeStyle: "short" })}.
                  </p>
                ) : null}
              </div>
            ) : null}

            {result?.checkoutUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={result.checkoutUrl} target="_blank" rel="noreferrer">
                  Abrir pagamento seguro
                </a>
              </Button>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Nenhum dado do seu cartão é armazenado por esta loja.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
