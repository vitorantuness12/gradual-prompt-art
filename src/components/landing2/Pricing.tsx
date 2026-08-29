import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";

/** Formato usado pelos cartões desta seção. */
interface PricingCard {
  name: string;
  description: string;
  popular: boolean;
  features: string[];
  cta: string;
  price?: string;
}

/** Usado apenas se ainda não houver planos publicados no painel. */
const fallbackPlans: PricingCard[] = [
  {
    name: "Inicial",
    description: "Para começar sua operação online.",
    popular: false,
    features: [
      "Loja própria com URL exclusiva",
      "Catálogo e cardápio digital",
      "Pedidos online",
      "Retirada e delivery",
      "Notificações de pedido",
      "Suporte básico",
    ],
    cta: "Criar minha loja",
  },
  {
    name: "Profissional",
    description: "Para negócios em crescimento.",
    popular: true,
    features: [
      "Tudo do Inicial",
      "PDV e controle de caixa",
      "Cupons, cashback e fidelidade",
      "Relatórios avançados",
      "Estoque, lotes e validade",
      "Gestão de entregadores e rotas",
      "Mesas, comandas e divisão de conta",
      "Catálogo com inteligência artificial",
      "Agenda com lembretes no WhatsApp",
    ],
    cta: "Começar teste grátis",
  },
  {
    name: "Empresarial",
    description: "Para operações completas.",
    popular: false,
    features: [
      "Tudo do Profissional",
      "Pedidos ilimitados",
      "Múltiplos usuários e entregadores",
      "API REST, webhooks e integrações avançadas",
      "KDS e impressão setorizada",
      "Encomendas com orçamento e produção",
      "Produtos digitais e assinaturas recorrentes",
      "Suporte prioritário",
    ],
    cta: "Falar com um consultor",
  },

  {
    name: "Personalizado",
    description: "Para redes, franquias e operações com necessidades específicas.",
    popular: false,
    features: [
      "Múltiplas lojas",
      "Gestão centralizada",
      "Permissões avançadas",
      "Relatórios consolidados",
      "Integrações personalizadas",
      "Atendimento dedicado",
    ],
    cta: "Falar com um consultor",
  },
];


const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 60, scale: 0.9 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 100,
      damping: 15,
    },
  },
};

const Pricing = () => {
  // Planos publicados no painel administrativo (/admin > Planos).
  const { data: dbPlans = [] } = useQuery({
    queryKey: ["public-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("name, tagline, description, price_month, highlights, is_highlighted, is_active, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("price_month", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  // Apenas um cartão pode receber o selo "Mais Popular": o primeiro destacado na ordem do banco.
  const highlightedIndex = dbPlans.findIndex((plan) => plan.is_highlighted);

  const plans: PricingCard[] = dbPlans.length
    ? dbPlans.map((plan, index) => ({
        name: plan.name,
        description: plan.tagline ?? plan.description ?? "",
        popular: index === highlightedIndex,
        features: plan.highlights ?? [],
        cta: Number(plan.price_month) > 0 ? "Começar teste grátis" : "Criar minha loja",
        price: Number(plan.price_month) > 0 ? `${formatCurrency(Number(plan.price_month))}/mês` : "Grátis",
      }))
    : fallbackPlans;


  return (
    <section id="precos" className="py-16 md:py-24 bg-background relative overflow-hidden">
      {/* Animated Background */}
      <motion.div
        className="absolute inset-0 bg-gradient-hero opacity-50"
        style={{ opacity: 0.9 }}
        animate={{
          backgroundPosition: ["0% 0%", "100% 100%"],
        }}
        transition={{ duration: 20, repeat: Infinity, repeatType: "reverse" }}
      />
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] md:w-[600px] h-[300px] md:h-[600px] bg-primary/5 rounded-full blur-3xl"
        animate={{
          scale: [1, 1.2, 1],
          rotate: [0, 180, 360],
        }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
      />

      <div className="container relative z-10 px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="text-center mb-10 md:mb-16"
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="inline-block px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium mb-4"
          >
            Planos & Preços
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 md:mb-6"
          >
            Escolha o plano ideal para{" "}
            <span className="text-gradient">seu negócio</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
            className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto px-2"
          >
            Planos para pedidos, delivery, PDV, mesas e agendamentos. Os valores e
            recursos de cada plano são definidos no momento do cadastro.
          </motion.p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 md:gap-8 max-w-6xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {plans.map((plan) => (
            <motion.div
              key={plan.name}
              variants={cardVariants}
              whileHover={{
                scale: 1.05,
                y: -10,
                transition: { type: "spring", stiffness: 300 },
              }}
              className={`relative p-6 md:p-8 rounded-2xl md:rounded-3xl border transition-all duration-300 ${
                plan.popular
                  ? "bg-gradient-card border-primary shadow-glow"
                  : "bg-card border-border hover:border-primary/30"
              }`}
            >
              {plan.popular && (
                <motion.div
                  initial={{ opacity: 0, y: -20, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.5, type: "spring" }}
                  className="absolute -top-4 left-1/2 -translate-x-1/2"
                >
                  <motion.div
                    className="flex items-center gap-1 px-4 py-2 bg-gradient-primary rounded-full text-sm font-semibold text-primary-foreground"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Sparkles className="w-4 h-4" />
                    Mais Popular
                  </motion.div>
                </motion.div>
              )}

              <div className="text-center mb-6 md:mb-8">
                <h3 className="font-display text-lg md:text-xl font-semibold mb-2 text-foreground">
                  {plan.name}
                </h3>
                {plan.price && (
                  <p className="font-display text-2xl md:text-3xl font-bold text-foreground mb-2">
                    {plan.price}
                  </p>
                )}
                <p className="text-muted-foreground text-xs md:text-sm mb-4 md:mb-6">
                  {plan.description}
                </p>
              </div>

              <ul className="space-y-3 md:space-y-4 mb-6 md:mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <motion.li
                    key={feature}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.4 + featureIndex * 0.05 }}
                    className="flex items-start gap-3"
                  >
                    <motion.div
                      className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5"
                      whileHover={{ scale: 1.2, backgroundColor: "hsl(var(--primary))" }}
                    >
                      <Check className="w-3 h-3 text-primary" />
                    </motion.div>
                    <span className="text-sm text-muted-foreground">
                      {feature}
                    </span>
                  </motion.li>
                ))}
              </ul>

              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                <Button
                  variant={plan.popular ? "hero" : "outline"}
                  size="lg"
                  className="w-full"
                  asChild
                >
                  <a href="/auth?modo=criar">
                    {plan.cta}
                  </a>
                </Button>
              </motion.div>
            </motion.div>
          ))}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.8 }}
          className="text-center text-muted-foreground text-sm mt-12"
        >
          Todos os planos podem incluir período de teste grátis. Consulte as condições atuais no momento do cadastro.
        </motion.p>
      </div>
    </section>
  );
};

export default Pricing;
