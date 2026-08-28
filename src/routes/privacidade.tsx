import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/landing/LegalPage";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de privacidade — O Seu Pedido" },
      {
        name: "description",
        content: "Como o O Seu Pedido coleta, usa e protege dados pessoais de lojistas e clientes, conforme a LGPD.",
      },
      { property: "og:title", content: "Política de privacidade — O Seu Pedido" },
      { property: "og:description", content: "Tratamento de dados pessoais na plataforma, conforme a LGPD." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/privacidade" },
    ],
    links: [{ rel: "canonical", href: "/privacidade" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Política de privacidade"
      updatedAt="Atualizado em agosto de 2026"
      sections={[
        {
          heading: "Dados que tratamos",
          paragraphs: [
            "Da pessoa responsável pela loja: nome, e-mail, telefone e dados de acesso.",
            "Do cliente final: nome, telefone, endereço de entrega e histórico de pedidos, informados no momento da compra.",
          ],
        },
        {
          heading: "Finalidades",
          paragraphs: [
            "Utilizamos os dados para autenticar o acesso, processar pedidos e agendamentos, prevenir fraudes, gerar relatórios da própria loja e cumprir obrigações legais.",
          ],
        },
        {
          heading: "Compartilhamento e isolamento",
          paragraphs: [
            "Cada loja acessa somente os próprios dados. Não vendemos dados pessoais nem os utilizamos para publicidade de terceiros.",
          ],
        },
        {
          heading: "Segurança",
          paragraphs: [
            "Adotamos autenticação segura, políticas de acesso por loja no banco de dados, registros de auditoria e transmissão criptografada.",
          ],
        },
        {
          heading: "Direitos do titular",
          paragraphs: [
            "Você pode solicitar confirmação, acesso, correção, portabilidade, anonimização ou exclusão dos seus dados escrevendo para contato@seupedido.app.",
          ],
        },
      ]}
    />
  );
}
