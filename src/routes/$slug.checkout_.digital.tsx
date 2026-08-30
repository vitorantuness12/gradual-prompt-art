import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Fase 1 dos checkouts especializados: a rota já existe e nunca fica quebrada.
 * Enquanto a tela dedicada de produtos digitais não entra, o cliente segue no
 * checkout compartilhado, que já cobre cliente, cupom, pagamento e pedido.
 */
export const Route = createFileRoute("/$slug/checkout_/digital")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$slug/checkout", params: { slug: params.slug } });
  },
});
