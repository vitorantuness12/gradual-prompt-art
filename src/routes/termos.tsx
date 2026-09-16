import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/landing/LegalPage";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de uso — Pedi Um" },
      {
        name: "description",
        content: "Condições de uso da plataforma Pedi Um para lojistas e clientes finais.",
      },
      { property: "og:title", content: "Termos de uso — Pedi Um" },
      { property: "og:description", content: "Condições de uso da plataforma Pedi Um." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://oseupedido.com.br/termos" },
    ],
    links: [{ rel: "canonical", href: "https://oseupedido.com.br/termos" }],

  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      title="Termos de uso"
      updatedAt="Atualizado em agosto de 2026"
      sections={[
        {
          heading: "1. Sobre a plataforma",
          paragraphs: [
            "Pedi Um é um serviço que permite a negócios criarem uma loja própria para receber pedidos e agendamentos. A plataforma disponibiliza as ferramentas; a operação comercial é de responsabilidade de cada loja.",
          ],
        },
        {
          heading: "2. Conta e responsabilidades",
          paragraphs: [
            "O responsável pela loja deve manter dados verdadeiros e atualizados, zelar pelo sigilo da senha e definir corretamente os papéis da equipe.",
            "É proibido usar a plataforma para atividades ilícitas ou para oferta de produtos cuja venda seja vedada pela legislação brasileira.",
          ],
        },
        {
          heading: "3. Pedidos e pagamentos",
          paragraphs: [
            "A relação de compra e venda ocorre entre a loja e o cliente final. A plataforma registra pedidos, valores e situação de pagamento informados pela própria loja.",
            "Os planos podem ser alterados mediante aviso prévio pelos canais de contato cadastrados.",
          ],
        },
        {
          heading: "4. Conteúdo de demonstração",
          paragraphs: [
            "Alguns registros podem ser exibidos com o selo “Exemplo”. Esse conteúdo é ilustrativo e não representa operação, avaliação ou faturamento reais.",
          ],
        },
        {
          heading: "5. Encerramento",
          paragraphs: [
            "A loja pode encerrar o uso a qualquer momento. A plataforma pode suspender contas em caso de descumprimento destes termos, com comunicação ao responsável.",
          ],
        },
      ]}
    />
  );
}
