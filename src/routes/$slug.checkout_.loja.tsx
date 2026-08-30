import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Fase 1: rota do checkout de produtos físicos já reservada. Até a tela com
 * frete e revalidação de estoque entrar, o cliente usa o checkout compartilhado.
 */
export const Route = createFileRoute("/$slug/checkout_/loja")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$slug/checkout", params: { slug: params.slug } });
  },
});
