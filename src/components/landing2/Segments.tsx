import { motion } from "framer-motion";
import {
  ChefHat,
  Pizza,
  ShoppingBasket,
  Stethoscope,
  Dog,
  CupSoda,
  Scissors,
  Shirt,
  Wrench,
  CalendarClock,
  GraduationCap,
  Repeat,
} from "lucide-react";

const segments = [
  {
    icon: ChefHat,
    title: "Restaurantes e delivery",
    description: "Pedidos para entrega, retirada, mesa e consumo local.",
  },
  {
    icon: Pizza,
    title: "Pizzarias e hamburguerias",
    description: "Combos, adicionais, variações e montagem personalizada.",
  },
  {
    icon: ShoppingBasket,
    title: "Mercados e mercearias",
    description: "Catálogo amplo, estoque conectado às vendas e entregas.",
  },
  {
    icon: Stethoscope,
    title: "Farmácias e conveniências",
    description: "Pedidos rápidos, notificações e entrega por região.",
  },
  {
    icon: Dog,
    title: "Pet shops e clínicas veterinárias",
    description: "Produtos, serviços e agenda de banho, tosa e consultas.",
  },
  {
    icon: CupSoda,
    title: "Cafeterias e padarias",
    description: "QR Code nas mesas, comandas e encomendas agendadas.",
  },
  {
    icon: Scissors,
    title: "Salões e barbearias",
    description: "Agendamento por profissional, horários e sinais.",
  },
  {
    icon: Shirt,
    title: "Lojas de roupas e varejo",
    description: "Catálogo com fotos, variações, PDV e entrega.",
  },
  {
    icon: Wrench,
    title: "Assistências técnicas",
    description: "Ordens por agendamento, status e histórico do cliente.",
  },
  {
    icon: CalendarClock,
    title: "Serviços com agendamento",
    description: "Reservas, horários, profissionais e confirmações.",
  },
  {
    icon: GraduationCap,
    title: "Cursos e produtos digitais",
    description: "Venda de itens digitais com pagamento online.",
  },
  {
    icon: Repeat,
    title: "Assinaturas e encomendas",
    description: "Pedidos futuros, recorrência e personalizações.",
  },
];


const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.95 },
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

const Segments = () => {
  return (
    <section id="segmentos" className="pt-16 md:pt-24 pb-6 md:pb-10 bg-card relative overflow-hidden">
      {/* Background Elements */}
      <motion.div
        className="absolute top-0 left-0 w-64 md:w-96 h-64 md:h-96 bg-primary/5 rounded-full blur-3xl"
        animate={{
          x: [0, 30, 0],
          y: [0, 20, 0],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-0 right-0 w-48 md:w-80 h-48 md:h-80 bg-accent/5 rounded-full blur-3xl"
        animate={{
          x: [0, -20, 0],
          y: [0, -30, 0],
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
            Segmentos
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 md:mb-6"
          >
            Feito para o{" "}
            <span className="text-gradient">seu tipo de negócio</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto px-2"
          >
            Nossa plataforma se adapta às necessidades específicas de cada
            segmento, com funcionalidades pensadas para o seu negócio.
          </motion.p>
        </motion.div>

        <motion.div
          className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 max-w-5xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {segments.map((segment) => (
            <motion.div
              key={segment.title}
              variants={itemVariants}
              whileHover={{
                y: -8,
                scale: 1.03,
                transition: { type: "spring", stiffness: 300 },
              }}
              className="group relative p-5 md:p-6 bg-background rounded-xl md:rounded-2xl border border-border hover:border-primary/30 transition-all duration-300 cursor-pointer overflow-hidden"
            >
              {/* Gradient Background on Hover */}
              <div
                className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              />

              <motion.div
                className="relative w-12 h-12 md:w-14 md:h-14 bg-gradient-primary rounded-xl md:rounded-2xl flex items-center justify-center mb-4 shadow-glow-sm"
                whileHover={{ rotate: [0, -10, 10, 0], scale: 1.1 }}
                transition={{ duration: 0.4 }}
              >
                <segment.icon className="w-6 h-6 md:w-7 md:h-7 text-primary-foreground" strokeWidth={1.5} />
              </motion.div>

              <h3 className="relative font-display font-semibold text-base md:text-lg mb-2 text-foreground group-hover:text-primary transition-colors">
                {segment.title}
              </h3>
              <p className="relative text-muted-foreground text-xs md:text-sm leading-relaxed">
                {segment.description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6 }}
          className="text-center text-muted-foreground text-sm mt-6"
        >
          E muito mais! Qualquer negócio que faz entregas pode usar nossa plataforma.
        </motion.p>
      </div>
    </section>
  );
};

export default Segments;
