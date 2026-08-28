import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "Qual será o endereço da minha loja?",
    answer:
      "Sua loja terá uma URL própria no formato oseupedido.com.br/nomedaloja. O nome da loja será exclusivo e poderá ser divulgado por link ou QR Code.",
  },
  {
    question: "O sistema cobra comissão por pedido?",
    answer:
      "O modelo do Seu Pedido é configurável por plano. Quando o plano contratado não possui comissão, o lojista paga apenas a mensalidade correspondente.",
  },
  {
    question: "Posso vender pelo WhatsApp?",
    answer:
      "Sim. O sistema pode ser preparado para notificações, atendimento e automações com a API oficial do WhatsApp Business, conforme a configuração da conta do lojista.",
  },
  {
    question: "Posso usar para delivery, retirada e mesas?",
    answer:
      "Sim. A loja pode habilitar delivery, retirada, consumo local, mesas, comandas, QR Code e pedidos agendados.",
  },
  {
    question: "Existe PDV?",
    answer:
      "Sim. O sistema possui estrutura para vendas no balcão, controle de caixa, sangrias, operadores e pagamento dividido.",
  },
  {
    question: "Posso controlar o estoque?",
    answer:
      "Sim. O estoque pode ser atualizado conforme as vendas e os produtos podem ser pausados quando estiverem indisponíveis.",
  },
  {
    question: "Posso integrar meios de pagamento?",
    answer:
      "Sim. A plataforma é preparada para Pix, cartão e integrações com gateways oficiais, sempre dependendo da configuração e das credenciais do lojista.",
  },
  {
    question: "Posso integrar com marketplaces?",
    answer:
      "A plataforma pode ser preparada para integrações por APIs oficiais disponíveis. A disponibilidade depende do provedor e das credenciais autorizadas.",
  },
  {
    question: "Preciso instalar um aplicativo?",
    answer:
      "A plataforma funciona pelo navegador e pode ser disponibilizada como PWA instalável. Aplicativos nativos dependem de configuração e publicação específicas.",
  },
  {
    question: "Dá para montar o catálogo automaticamente?",
    answer:
      "Sim. Você pode enviar uma foto do cardápio ou colar uma lista em texto e a inteligência artificial sugere nomes, descrições, categorias e preços para você revisar antes de publicar.",
  },
  {
    question: "Trabalho com encomendas. O sistema atende?",
    answer:
      "Sim. Você envia um orçamento com link de aprovação para o cliente, define sinal de 50% com saldo na entrega, campos obrigatórios de personalização, checklist de produção, data de corte e limite de encomendas por dia.",
  },
  {
    question: "Atendo com hora marcada. Como funciona a agenda?",
    answer:
      "A agenda controla profissionais, bloqueios, encaixes e lista de espera, envia lembretes automáticos por WhatsApp 24h e 2h antes, permite o cliente remarcar pelo link e calcula comissões e repasses.",
  },
  {
    question: "Vendo produtos digitais e assinaturas?",
    answer:
      "Sim. A entrega usa link expirável com limite de downloads, área do comprador e cobrança recorrente com retentativa, inadimplência, reativação e reembolso.",
  },
  {
    question: "Meus dados ficam protegidos?",
    answer:
      "Cada loja acessa somente os próprios dados, com permissões por função, trilha de auditoria das ações críticas e ferramentas de exportação e exclusão de dados conforme a LGPD.",
  },
];


const FAQ = () => {
  return (
    <section id="faq" className="py-16 md:py-24 bg-muted/30 relative overflow-hidden">
      {/* Background elements */}
      <motion.div
        className="absolute top-0 left-1/4 w-64 h-64 bg-primary/5 rounded-full blur-3xl"
        animate={{
          y: [0, 30, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-0 right-1/4 w-48 h-48 bg-accent/5 rounded-full blur-3xl"
        animate={{
          y: [0, -20, 0],
          scale: [1, 1.15, 1],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="container relative z-10 px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center mb-10 md:mb-16"
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="inline-block px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium mb-4"
          >
            Dúvidas Frequentes
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 md:mb-6"
          >
            Perguntas{" "}
            <span className="text-gradient">Frequentes</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto px-2"
          >
            Tire suas dúvidas sobre a loja própria, funcionalidades, planos e integrações.
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="max-w-3xl mx-auto"
        >
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 * index, duration: 0.4 }}
              >
                <AccordionItem
                  value={`item-${index}`}
                  className="bg-background border border-border rounded-xl px-4 md:px-6 data-[state=open]:border-primary/30 transition-colors"
                >
                  <AccordionTrigger className="text-left font-display font-semibold text-sm md:text-base hover:text-primary transition-colors py-4 md:py-5">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-sm md:text-base pb-4 md:pb-5">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              </motion.div>
            ))}
          </Accordion>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6 }}
          className="text-center text-muted-foreground text-sm mt-8"
        >
          Ainda tem dúvidas?{" "}
          <a
            href="https://wa.me/5500000000000"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium"
          >
            Falar com um consultor
          </a>
        </motion.p>
      </div>
    </section>
  );
};

export default FAQ;
