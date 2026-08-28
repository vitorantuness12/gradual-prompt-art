import { motion, useScroll, useTransform } from "framer-motion";
import { Printer, ShoppingBag, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRef } from "react";

const benefits = [
  {
    icon: ShoppingBag,
    title: "100% da sua marca, 0% de comissão",
    description:
      "Sua loja com sua identidade, seus clientes e seus dados. Sem comissão sobre os pedidos e sem depender de marketplaces.",
  },
  {
    icon: Printer,
    title: "Operação integrada em tempo real",
    description:
      "Pedidos organizados automaticamente, estoque conectado às vendas, gestão de entregadores e catálogo fácil de atualizar.",
  },
  {
    icon: Users,
    title: "Mais controle e mais recompra",
    description:
      "Atendimento online e presencial, relatórios para decidir melhor, fidelização, cashback e URL própria para divulgar sua loja.",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -30 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      type: "spring" as const,
      stiffness: 100,
      damping: 12,
    },
  },
};

const WhyUs = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const backgroundY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const statsScale = useTransform(scrollYProgress, [0.2, 0.5], [0.8, 1]);
  const statsOpacity = useTransform(scrollYProgress, [0.2, 0.4], [0, 1]);

  return (
    <section
      ref={sectionRef}
      className="pt-10 md:pt-16 pb-16 md:pb-24 bg-card relative overflow-hidden"
    >
      <motion.div className="absolute inset-0" style={{ y: backgroundY }}>
        <div className="absolute top-1/2 right-0 w-48 md:w-96 h-48 md:h-96 bg-primary/5 rounded-full blur-3xl -translate-y-1/2" />
      </motion.div>

      <div className="container relative z-10 px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="inline-block px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium mb-4"
            >
              Por que nos escolher?
            </motion.span>
            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="font-display text-[1.35rem] leading-tight sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 md:mb-6 text-balance"
            >
              Seu negócio precisa de uma{" "}
              <span className="text-gradient">plataforma própria</span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-muted-foreground text-sm sm:text-base md:text-lg mb-6 md:mb-10 text-balance"
            >
              Sua loja, seus clientes, seus dados e sua marca. Mais controle sobre
              pedidos, vendas e operação, em um só painel.
            </motion.p>

            <motion.div
              className="space-y-6"
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              {benefits.map((benefit, index) => (
                <motion.div
                  key={benefit.title}
                  variants={itemVariants}
                  whileHover={{ x: 4, scale: 1.01 }}
                  className="flex items-start gap-3 sm:gap-4 cursor-pointer"
                >
                  <motion.div
                    className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0"
                    whileHover={{ rotate: 360, scale: 1.1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <benefit.icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                  </motion.div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display font-semibold text-base sm:text-lg text-foreground mb-1">
                      {benefit.title}
                    </h3>
                    <p className="text-muted-foreground text-xs sm:text-sm text-balance">
                      {benefit.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            <motion.div
              className="mt-6 md:mt-10 flex flex-col sm:flex-row gap-3 md:gap-4"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.6, duration: 0.5 }}
            >
              <motion.div className="w-full sm:w-auto" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                <Button variant="hero" size="lg" className="w-full sm:w-auto" asChild>
                  <a href="/auth?modo=criar">Criar minha loja</a>
                </Button>
              </motion.div>
              <motion.div className="w-full sm:w-auto" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                <Button variant="outline" size="lg" className="w-full sm:w-auto" asChild>
                  <a href="#funcoes">Conhecer as funcionalidades</a>
                </Button>
              </motion.div>
            </motion.div>
          </motion.div>

          {/* Stats Card with Parallax */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{ scale: statsScale, opacity: statsOpacity }}
            className="relative px-1 sm:px-0"
          >
            <motion.div
              className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-75"
              animate={{
                scale: [0.75, 0.85, 0.75],
                opacity: [0.2, 0.3, 0.2],
              }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="relative bg-gradient-card rounded-2xl md:rounded-3xl border border-border p-4 sm:p-6 md:p-8 lg:p-12"
              whileHover={{
                y: -4,
                transition: { duration: 0.3 },
              }}
            >
              <div className="grid grid-cols-2 gap-2 sm:gap-4 md:gap-8">
                {[
                  { value: "0%", label: "Comissão sobre pedidos" },
                  { value: "100%", label: "Da sua marca" },
                  { value: "24/7", label: "Loja online no ar" },
                  { value: "7 dias", label: "De teste grátis" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="text-center p-2 sm:p-4 cursor-default flex flex-col justify-center h-full"
                  >
                    <div className="font-display text-xl sm:text-2xl md:text-4xl lg:text-5xl font-bold text-gradient mb-1 md:mb-2">
                      {stat.value}
                    </div>
                    <div className="text-muted-foreground text-[10px] sm:text-xs md:text-sm text-balance leading-tight">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>

              <motion.div
                className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-border"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.8 }}
              >
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
                  <div className="flex -space-x-3">
                    {["M", "J", "A", "C"].map((letter, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.9 + i * 0.1 }}
                        whileHover={{ scale: 1.2, zIndex: 10 }}
                        className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-primary rounded-full flex items-center justify-center border-2 border-card relative"
                      >
                        <span className="text-primary-foreground font-semibold text-xs sm:text-sm">
                          {letter}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
                    <span className="text-foreground font-semibold">Sua loja</span>{" "}
                    em oseupedido.com.br/nomedaloja
                  </p>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default WhyUs;
