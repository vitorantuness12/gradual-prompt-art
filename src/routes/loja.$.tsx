import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Compatibilidade: o formato antigo /loja/nomedaloja foi substituído
 * pelo endereço público oficial /nomedaloja. Redirecionamos preservando o caminho.
 */
export const Route = createFileRoute("/loja/$")({
  beforeLoad: ({ params }) => {
    const rest = (params as { _splat?: string })._splat ?? "";
    throw redirect({ href: `/${rest}`, replace: true });
  },
  component: () => null,
});
