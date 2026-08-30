import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Fase 1: rota do checkout de serviços já reservada. Até a tela com seleção de
 * profissional, data e horário entrar, o cliente usa o checkout compartilhado.
 */
export const Route = createFileRoute("/$slug/checkout_/agendamento")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$slug/checkout", params: { slug: params.slug } });
  },
});
