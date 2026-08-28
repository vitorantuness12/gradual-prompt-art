import { motion } from "framer-motion";
import { Link2, QrCode, Instagram, MessageCircle } from "lucide-react";

/** Exemplos de endereços exibidos apenas como ilustração do formato da URL. */
const EXAMPLES = [
  "oseupedido.com.br/pizzariabella",
  "oseupedido.com.br/barbearia-central",
  "oseupedido.com.br/pet-amigo",
];

const CHANNELS = [
  { icon: Instagram, label: "Instagram" },
  { icon: MessageCircle, label: "WhatsApp" },
  { icon: QrCode, label: "QR Code" },
  { icon: Link2, label: "Cartão de visita" },
];

const StoreUrl = () => {
  return (
    <section
      id="url-propria"
      className="py-16 md:py-24 bg-background relative overflow-hidden"
    >
      <motion.div
        className="absolute top-1/2 left-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2"
        animate={{ x: [0, 30, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="container relative z-10 px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center mb-10 md:mb-14"
        >
          <span className="inline-block px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium mb-4">
            Sua URL própria
          </span>
          <h2 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 md:mb-6">
            Cada negócio recebe sua própria{" "}
            <span className="text-gradient">loja online</span>
          </h2>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto px-2">
            Cada negócio recebe sua própria loja online no endereço
            oseupedido.com.br/nomedaloja. O “nomedaloja” é um endereço exclusivo e
            personalizável, sem exposição de IDs internos, ideal para divulgar no
            Instagram, WhatsApp, Google, cartão de visita e QR Code.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto bg-gradient-card border border-border rounded-2xl md:rounded-3xl p-6 md:p-10"
        >
          <p className="text-sm text-muted-foreground mb-3 text-center">
            Cada negócio recebe sua própria loja online no endereço:
          </p>
          <p className="font-display text-lg sm:text-2xl md:text-3xl font-bold text-center text-gradient break-all mb-8">
            oseupedido.com.br/nomedaloja
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-8">
            {EXAMPLES.map((example) => (
              <motion.div
                key={example}
                whileHover={{ y: -6, scale: 1.03 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="px-4 py-3 bg-background border border-border rounded-xl text-center text-xs sm:text-sm text-muted-foreground break-all"
              >
                {example}
              </motion.div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
            {CHANNELS.map((channel) => (
              <div
                key={channel.label}
                className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-full text-xs md:text-sm text-primary"
              >
                <channel.icon className="w-4 h-4" />
                {channel.label}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default StoreUrl;
