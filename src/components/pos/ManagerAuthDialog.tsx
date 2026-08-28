import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

interface ManagerAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Descrição da ação que precisa de liberação. */
  action: string;
  isPending: boolean;
  onConfirm: (credentials: { email: string; password: string }) => void;
}

/**
 * Liberação de ação sensível com credencial de gerente ou proprietário.
 * A senha vai direto para o servidor e não é guardada em nenhum lugar.
 */
export function ManagerAuthDialog({ open, onOpenChange, action, isPending, onConfirm }: ManagerAuthDialogProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open) return;
    setEmail("");
    setPassword("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" aria-hidden="true" />
            Autorização de gerente
          </DialogTitle>
          <DialogDescription>
            Esta ação exige liberação: <strong>{action}</strong>. Peça para a gerência entrar com a credencial dela.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm({ email: email.trim(), password });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="gerente-email">E-mail do gerente</Label>
            <Input
              id="gerente-email"
              type="email"
              className="h-11"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gerente-senha">Senha</Label>
            <Input
              id="gerente-senha"
              type="password"
              className="h-11"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || !email.trim() || password.length < 6}>
              {isPending ? "Verificando..." : "Autorizar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
