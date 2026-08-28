import { motion } from "framer-motion";
import {
  Printer,
  Heart,
  Smartphone,
  BarChart3,
  Users,
  MessageSquare,
  CreditCard,
  Package,
  MapPin,
  Palette,
  Layers,
  CalendarClock,
  Monitor,
  UtensilsCrossed,
  Wallet,
  Bot,
  FileText,
  Truck,
  Code,
  PrinterCheck,
  Plug,
  ShoppingCart,
  Sparkles,
  ScanBarcode,
  CalendarCheck,
  RotateCcw,
  Download,
  Repeat,
  Route,
  Scale,
  ShieldCheck,
} from "lucide-react";


const features = [
  {
    icon: Palette,
    title: "Loja própria personalizada",
    description:
      "Crie sua loja online com logo, cores, banner, catálogo, domínio e URL exclusiva no formato oseupedido.com.br/nomedaloja.",
  },
  {
    icon: Layers,
    title: "Catálogo e cardápio digital",
    description:
      "Cadastre produtos, serviços, categorias, fotos, preços, promoções, variações, adicionais, combos, kits e observações.",
  },
  {
    icon: ShoppingCart,
    title: "Pedidos online",
    description:
      "Receba pedidos para delivery, retirada, consumo local, mesa ou agendamento, com acompanhamento de status em tempo real.",
  },
  {
    icon: Smartphone,
    title: "PDV completo",
    description:
      "Faça vendas no balcão, controle o caixa, registre sangrias, entradas, saídas, operadores e diferentes formas de pagamento.",
  },
  {
    icon: UtensilsCrossed,
    title: "Mesas e comandas",
    description:
      "Gerencie mesas, comandas, pedidos por QR Code, chamada de garçom, divisão de conta, transferência de mesa e fechamento parcial.",
  },
  {
    icon: Printer,
    title: "Impressão automática e setorizada",
    description:
      "Envie pedidos automaticamente para cozinha, bar, expedição, caixa ou outros setores, com suporte a diferentes modelos de impressão.",
  },
  {
    icon: Monitor,
    title: "KDS e monitor de preparo",
    description:
      "Organize a produção por setor, acompanhe o tempo de preparo e priorize pedidos em uma tela operacional.",
  },
  {
    icon: CreditCard,
    title: "Pagamentos online",
    description:
      "Receba via Pix e cartão, acompanhe pagamentos, confirmações, falhas, estornos e reembolsos.",
  },
  {
    icon: Wallet,
    title: "Pagamento dividido",
    description:
      "Permita que o cliente divida uma compra entre Pix, dinheiro, débito, crédito ou outras formas configuradas.",
  },
  {
    icon: Truck,
    title: "Gestão de entregadores",
    description:
      "Cadastre entregadores, atribua pedidos, acompanhe status, rotas, comissões, comprovantes e ocorrências.",
  },
  {
    icon: MapPin,
    title: "Taxas e áreas de entrega",
    description:
      "Configure entrega por bairro, CEP, cidade, raio, distância, peso, pedido mínimo e frete grátis por região.",
  },
  {
    icon: Package,
    title: "Controle de estoque",
    description:
      "Controle entradas, saídas, perdas, inventário e estoque mínimo. Pause automaticamente produtos esgotados.",
  },
  {
    icon: CalendarClock,
    title: "Agenda e encomendas",
    description:
      "Gerencie serviços, reservas, horários, profissionais, pedidos futuros, encomendas, sinais e personalizações.",
  },
  {
    icon: MessageSquare,
    title: "WhatsApp integrado",
    description:
      "Envie notificações automáticas de pedido, pagamento, preparo, entrega, conclusão e cancelamento pelo WhatsApp oficial.",
  },
  {
    icon: Bot,
    title: "Atendimento com automação e IA",
    description:
      "Responda dúvidas, apresente o catálogo e encaminhe pedidos com automações configuráveis, com transferência para atendimento humano.",
  },
  {
    icon: Heart,
    title: "Cashback, cupons e fidelidade",
    description:
      "Crie descontos, cashback, pontos, níveis, missões, recompensas, bônus de aniversário e campanhas para clientes inativos.",
  },
  {
    icon: Users,
    title: "CRM de clientes",
    description:
      "Conheça o histórico de compras, frequência, valor gasto, preferências, localização, tags e comportamento dos seus clientes.",
  },
  {
    icon: BarChart3,
    title: "Relatórios e indicadores",
    description:
      "Acompanhe vendas, faturamento, ticket médio, produtos mais vendidos, horários de pico, clientes, entregas, pagamentos e cancelamentos.",
  },
  {
    icon: FileText,
    title: "Emissão fiscal preparada",
    description:
      "Prepare a operação para integração com NFC-e e NF-e por meio de provedores fiscais autorizados.",
  },
  {
    icon: Plug,
    title: "Integrações",
    description:
      "Conecte pagamentos, WhatsApp, marketplaces por APIs oficiais, mapas, cobranças recorrentes, produtos digitais, analytics e sistemas externos.",
  },
  {
    icon: Code,
    title: "API REST",
    description:
      "Integre o Seu Pedido a outros sistemas usando API REST documentada, autenticação segura, webhooks e permissões por escopo.",
  },
  {
    icon: PrinterCheck,
    title: "Aplicativo e PWA",
    description:
      "Acesse a gestão pelo celular e permita que clientes acompanhem pedidos, recebam notificações e instalem a loja como aplicativo.",
  },
  {
    icon: Sparkles,
    title: "Catálogo com inteligência artificial",
    description:
      "Tire uma foto ou cole uma lista de texto e a IA monta nomes, descrições, categorias e preços do catálogo para você revisar e publicar.",
  },
  {
    icon: CalendarCheck,
    title: "Encomendas e orçamentos",
    description:
      "Envie propostas com link de aprovação do cliente, sinal de 50% + saldo na entrega, checklist de produção, data de corte e capacidade por dia.",
  },
  {
    icon: ScanBarcode,
    title: "Grade de variações e etiquetas",
    description:
      "Estoque por SKU em tamanho × cor, geração de código de barras EAN-13, impressão de etiquetas e leitura por scanner no PDV.",
  },
  {
    icon: RotateCcw,
    title: "Trocas, devoluções e reservas",
    description:
      "Registre trocas e devoluções com crédito para o cliente, entrada de mercadoria por nota do fornecedor e reserva com retirada na loja.",
  },
  {
    icon: Scale,
    title: "Lotes, validade e venda por peso",
    description:
      "Controle lotes com saída FEFO, alertas de vencimento, relatório de perdas e venda fracionada por peso com etiqueta de balança.",
  },
  {
    icon: Download,
    title: "Produtos digitais protegidos",
    description:
      "Entrega por link expirável com limite de downloads, área do comprador, order bump, upsell e links de afiliado com UTM.",
  },
  {
    icon: Repeat,
    title: "Assinaturas recorrentes",
    description:
      "Cobrança automática com retentativa, controle de inadimplência, reativação, reembolsos e avisos por e-mail e WhatsApp.",
  },
  {
    icon: Route,
    title: "Rotas e frete por distância",
    description:
      "Mapa com rota do entregador, distância calculada automaticamente, prazo estimado dinâmico e frete por KM, bairro ou raio.",
  },
  {
    icon: ShieldCheck,
    title: "Segurança e LGPD",
    description:
      "Dados isolados por loja, permissões por função, trilha de auditoria, exportação e exclusão de dados e banner de consentimento.",
  },
];



const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.9 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 100,
      damping: 12,
    },
  },
};

const Features = () => {
  return (
    <section id="funcoes" className="py-16 md:py-24 bg-background relative overflow-hidden">
      {/* Animated Background Elements */}
      <motion.div
        className="absolute top-0 right-0 w-48 md:w-96 h-48 md:h-96 bg-primary/5 rounded-full blur-3xl"
        animate={{
          x: [0, 50, 0],
          y: [0, 30, 0],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-0 left-0 w-40 md:w-80 h-40 md:h-80 bg-accent/5 rounded-full blur-3xl"
        animate={{
          x: [0, -30, 0],
          y: [0, -50, 0],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
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
            Funcionalidades
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 md:mb-6"
          >
            Tudo que você precisa em{" "}
            <span className="text-gradient">um só lugar</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto px-2"
          >
            Loja própria, pedidos, PDV, mesas, entregas, estoque, pagamentos e gestão
            em uma plataforma única para o seu negócio.
          </motion.p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              whileHover={{
                y: -8,
                scale: 1.03,
                transition: { type: "spring", stiffness: 300 },
              }}
              className="group p-4 md:p-6 bg-gradient-card rounded-xl md:rounded-2xl border border-border hover:border-primary/30 transition-colors duration-300 cursor-pointer"
            >
              <motion.div
                className="w-10 h-10 md:w-12 md:h-12 bg-primary/10 rounded-lg md:rounded-xl flex items-center justify-center mb-3 md:mb-4 group-hover:bg-primary/20 transition-colors"
                whileHover={{ rotate: [0, -10, 10, 0], scale: 1.1 }}
                transition={{ duration: 0.4 }}
              >
                <feature.icon className="w-5 h-5 md:w-6 md:h-6 text-primary" />
              </motion.div>
              <h3 className="font-display font-semibold text-sm md:text-lg mb-1 md:mb-2 text-foreground group-hover:text-primary transition-colors">
                {feature.title}
              </h3>
              <p className="text-muted-foreground text-xs md:text-sm leading-relaxed hidden min-[420px]:block">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default Features;
