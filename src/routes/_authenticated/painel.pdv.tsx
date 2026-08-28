import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * O PDV agora roda em tela exclusiva na rota /pdv.
 * Este endereço antigo continua válido e apenas encaminha para lá.
 */
export const Route = createFileRoute("/_authenticated/painel/pdv")({
  beforeLoad: () => {
    throw redirect({ to: "/pdv" });
  },
});
