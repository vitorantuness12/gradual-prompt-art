import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const STORAGE_KEY = "seu-pedido:cookies";

/** Banner de consentimento de cookies conforme a LGPD. */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setVisible(window.localStorage.getItem(STORAGE_KEY) === null);
  }, []);

  function decide(choice: "essential" | "all") {
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, choice);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 rounded-2xl border border-border bg-card/95 p-4 shadow-card-soft backdrop-blur sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-md"
    >
      <p className="text-sm text-muted-foreground">
        Usamos cookies essenciais para o funcionamento da plataforma e, com o seu consentimento, cookies de
        medição para melhorar a experiência. Você pode alterar sua escolha a qualquer momento.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button size="sm" className="w-full bg-gradient-primary text-primary-foreground sm:w-auto" onClick={() => decide("all")}>
          Aceitar e continuar
        </Button>
        <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => decide("essential")}>
          Apenas essenciais
        </Button>
      </div>
    </div>
  );
}
