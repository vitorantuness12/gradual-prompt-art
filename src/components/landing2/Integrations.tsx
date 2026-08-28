import { motion } from "framer-motion";

const integrations = [
  {
    name: "iFood",
    logo: "https://logodownload.org/wp-content/uploads/2017/05/ifood-logo-0.png",
    description: "Integração por APIs oficiais disponíveis",
  },
  {
    name: "Mercado Pago",
    logo: "https://logodownload.org/wp-content/uploads/2019/06/mercado-pago-logo.png",
    description: "Pix e cartão conforme suas credenciais",
  },
  {
    name: "PagSeguro",
    logo: "https://logodownload.org/wp-content/uploads/2016/09/pagseguro-logo-0.png",
    description: "Pagamentos online com suas credenciais",
  },
  {
    name: "Asaas",
    logo: "https://boto.asaas.com/staticboto/structured-data-asaas-logo.png",
    description: "Cobranças e cobranças recorrentes",
  },
  {
    name: "WhatsApp",
    logo: "https://logodownload.org/wp-content/uploads/2015/04/whatsapp-logo-1.png",
    description: "Notificações e atendimento pela API oficial",
  },
  {
    name: "Hotmart",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Hotmart_logo.svg/2560px-Hotmart_logo.svg.png",
    description: "Produtos digitais e assinaturas",
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
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 100,
      damping: 12,
    },
  },
};

const Integrations = () => {
  return (
    <section id="integracoes" className="py-16 md:py-24 bg-muted/30 relative overflow-hidden">
      {/* Background elements */}
      <motion.div
        className="absolute top-1/2 left-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2"
        animate={{
          x: [0, 30, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/4 right-0 w-48 h-48 bg-accent/5 rounded-full blur-3xl"
        animate={{
          x: [0, -20, 0],
          scale: [1, 1.15, 1],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
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
            Integrações
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 md:mb-6"
          >
            Conecte com as{" "}
            <span className="text-gradient">melhores plataformas</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto px-2"
          >
            A plataforma é preparada para integrações por APIs oficiais. A
            disponibilidade depende do provedor e das credenciais do lojista.
          </motion.p>
        </motion.div>

        <motion.div
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-6"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {integrations.map((integration) => (
            <motion.div
              key={integration.name}
              variants={itemVariants}
              whileHover={{
                y: -8,
                scale: 1.05,
                transition: { type: "spring", stiffness: 300 },
              }}
              className="group flex flex-col items-center p-4 md:p-6 bg-background rounded-xl md:rounded-2xl border border-border hover:border-primary/30 hover:shadow-lg transition-all duration-300"
            >
              <div className="w-16 h-16 md:w-20 md:h-20 flex items-center justify-center mb-3 md:mb-4 p-2 bg-white rounded-xl">
                <img
                  src={integration.logo}
                  alt={integration.name}
                  loading="lazy"
                  decoding="async"
                  className="max-w-full max-h-full object-contain filter group-hover:brightness-110 transition-all"
                />
              </div>
              <h3 className="font-display font-semibold text-sm md:text-base text-foreground text-center mb-1">
                {integration.name}
              </h3>
              <p className="text-muted-foreground text-xs text-center hidden sm:block">
                {integration.description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6 }}
          className="text-center text-muted-foreground text-sm mt-8"
        >
          Também é possível integrar mapas, analytics e sistemas externos via API REST.
        </motion.p>
      </div>
    </section>
  );
};

export default Integrations;
