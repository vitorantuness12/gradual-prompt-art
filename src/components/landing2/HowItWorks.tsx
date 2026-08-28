import { motion } from "framer-motion";
import { UserPlus, Store, Share2, ClipboardList } from "lucide-react";

const steps = [
  {
    icon: UserPlus,
    title: "Crie sua conta",
    description: "Crie sua conta e escolha o segmento do negócio.",
  },
  {
    icon: Store,
    title: "Configure sua loja",
    description:
      "Configure sua loja e cadastre produtos, serviços ou cardápio.",
  },
  {
    icon: Share2,
    title: "Divulgue",
    description: "Divulgue sua URL própria, QR Code e WhatsApp.",
  },
  {
    icon: ClipboardList,
    title: "Receba pedidos",
    description:
      "Receba pedidos, pagamentos, agendamentos e acompanhe toda a operação.",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.15 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 100, damping: 12 },
  },
};

const HowItWorks = () => {
  return (
    <section
      id="como-funciona"
      className="py-16 md:py-24 bg-card relative overflow-hidden"
    >
      <motion.div
        className="absolute bottom-0 right-0 w-48 md:w-80 h-48 md:h-80 bg-accent/5 rounded-full blur-3xl"
        animate={{ x: [0, -20, 0], y: [0, -30, 0] }}
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
          <span className="inline-block px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium mb-4">
            Como funciona
          </span>
          <h2 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 md:mb-6">
            Sua operação no ar em{" "}
            <span className="text-gradient">quatro etapas</span>
          </h2>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto px-2">
            Do cadastro ao primeiro pedido, com loja própria, catálogo e
            acompanhamento em tempo real.
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              variants={itemVariants}
              whileHover={{ y: -8, scale: 1.03 }}
              className="relative p-5 md:p-6 bg-background rounded-xl md:rounded-2xl border border-border hover:border-primary/30 transition-colors duration-300"
            >
              <span className="absolute top-4 right-5 font-display text-3xl md:text-4xl font-bold text-primary/10">
                {index + 1}
              </span>
              <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-primary rounded-xl md:rounded-2xl flex items-center justify-center mb-4 shadow-glow-sm">
                <step.icon
                  className="w-6 h-6 md:w-7 md:h-7 text-primary-foreground"
                  strokeWidth={1.5}
                />
              </div>
              <h3 className="font-display font-semibold text-base md:text-lg mb-2 text-foreground">
                {step.title}
              </h3>
              <p className="text-muted-foreground text-xs md:text-sm leading-relaxed">
                {step.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default HowItWorks;
