import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestTrackingCode } from "@/lib/acompanhamento.functions";
import { startCustomerSession } from "@/lib/cliente.functions";
import { maskPhone } from "@/lib/masks";

/**
 * Entrada na área do cliente: telefone + código de 6 dígitos enviado pelo
 * WhatsApp da loja. A resposta do envio é sempre genérica, para não revelar
 * quem é cliente da plataforma.
 */
interface Props {
  onSession: (session: string, phoneMasked: string) => void;
}

export function PhoneLoginCard({ onSession }: Props) {
  const askCode = useServerFn(requestTrackingCode);
  const startSession = useServerFn(startCustomerSession);

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await askCode({ data: { phone } });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setSent(true);
      toast.success(result.message);
    } catch {
      toast.error("Não foi possível enviar o código agora.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await startSession({ data: { phone, code } });
      if (!result.ok || !result.session) {
        toast.error(result.message);
        return;
      }
      onSession(result.session, result.phoneMasked);
    } catch {
      toast.error("Não foi possível confirmar o código agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Entrar com meu telefone</CardTitle>
        <CardDescription>
          Enviamos um código de 6 dígitos pelo WhatsApp. Ele vale por 10 minutos e libera seu
          histórico por 12 horas neste aparelho.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={sendCode} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cliente-telefone">Telefone com DDD</Label>
            <Input
              id="cliente-telefone"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(65) 91234-5678"
              value={phone}
              onChange={(event) => setPhone(maskPhone(event.target.value))}
              required
            />
          </div>
          <Button type="submit" disabled={busy} variant={sent ? "outline" : "default"}>
            {sent ? "Enviar novo código" : "Receber código"}
          </Button>
        </form>

        {sent ? (
          <form onSubmit={confirmCode} className="space-y-3 border-t border-border pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="cliente-codigo">Código recebido</Label>
              <Input
                id="cliente-codigo"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                required
              />
            </div>
            <Button type="submit" disabled={busy}>
              Ver meus pedidos
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
