import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/landing/LegalPage";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookies e LGPD — O Seu Pedido" },
      {
        name: "description",
        content: "Quais cookies o O Seu Pedido utiliza, para que servem e como gerenciar o seu consentimento.",
      },
      { property: "og:title", content: "Cookies e LGPD — O Seu Pedido" },
      { property: "og:description", content: "Uso de cookies e gestão de consentimento na plataforma." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://oseupedido.com.br/cookies" },
    ],
    links: [{ rel: "canonical", href: "https://oseupedido.com.br/cookies" }],

  }),
  component: CookiesPage,
});

function CookiesPage() {
  return (
    <LegalPage
      title="Cookies e LGPD"
      updatedAt="Atualizado em agosto de 2026"
      sections={[
        {
          heading: "Cookies essenciais",
          paragraphs: [
            "Necessários para manter a sessão iniciada, lembrar a loja selecionada no painel e guardar o carrinho durante a compra. Sem eles a plataforma não funciona corretamente.",
          ],
        },
        {
          heading: "Cookies de medição",
          paragraphs: [
            "Ajudam a entender quais páginas são mais usadas para melhorar a experiência. Só são ativados após o consentimento no banner.",
          ],
        },
        {
          heading: "Como alterar a sua escolha",
          paragraphs: [
            "Você pode limpar os dados do site no navegador para que o banner de consentimento apareça novamente e uma nova opção seja registrada.",
          ],
        },
        {
          heading: "Encarregado de dados",
          paragraphs: [
            "Dúvidas e solicitações relacionadas à LGPD podem ser enviadas para contato@seupedido.app.",
          ],
        },
      ]}
    />
  );
}
