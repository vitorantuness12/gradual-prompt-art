import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import welcomeImg from "@/assets/welcome-img.png";
import { Smartphone, Zap, Users, TrendingUp } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

/** Posições determinísticas para evitar divergência entre servidor e cliente. */
const PARTICLES = Array.from({ length: 10 }, (_, i) => ({
  left: (i * 37) % 100,
  top: (i * 61) % 100,
  duration: 4 + (i % 3),
  delay: (i % 5) * 0.4,
}));

const Hero = () => {
  const isMobile = useIsMobile();

  return (
    <section
      className="relative min-h-[100svh] bg-gradient-hero overflow-hidden"
    >
      {/* Background Elements - Simplified on mobile */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
        {!isMobile && (
          <>
            <motion.div
              className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl"
              animate={{
                scale: [1.2, 1, 1.2],
                opacity: [0.1, 0.2, 0.1],
              }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl"
              animate={{
                rotate: [0, 360],
              }}
              transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            />
          </>
        )}
      </div>

      {/* Grid Pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Floating Particles - Only on desktop */}
      {!isMobile && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {PARTICLES.map((particle, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-primary/30 rounded-full"
              style={{
                left: `${particle.left}%`,
                top: `${particle.top}%`,
              }}
              animate={{
                y: [0, -100, 0],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: particle.duration,
                repeat: Infinity,
                delay: particle.delay,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      )}


      <div className="container relative z-10 pt-32 md:pt-32 pb-12 md:pb-20 px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-center lg:text-left"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-glass rounded-full mb-8"
            >
              <motion.span
                className="w-2 h-2 bg-primary rounded-full"
                animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span className="text-sm text-muted-foreground">
                Delivery • Agendamentos • Produtos digitais • Varejo
              </span>
            </motion.div>

            <motion.h1
              className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4 md:mb-6"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
            >
              <motion.span
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                Crie sua loja online{" "}
              </motion.span>
              <motion.span
                className="text-gradient inline-block"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
              >
                própria
              </motion.span>
              <motion.span
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 }}
              >
                {" "}e venda do seu jeito{" "}
              </motion.span>
              <motion.span
                className="text-gradient inline-block"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, type: "spring", stiffness: 200 }}
              >
                sem comissão
              </motion.span>
            </motion.h1>

            <motion.p
              className="text-base sm:text-lg md:text-xl text-muted-foreground mb-6 md:mb-8 max-w-2xl mx-auto lg:mx-0 px-2 sm:px-0"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.5 }}
            >
              Tudo para o seu negócio vender online: loja própria com sua marca,
              catálogo, estoque, pagamentos, entregas e relatórios. Sem depender
              de marketplaces e sem pagar comissão por venda.
            </motion.p>

            {/* Segmentos */}
            <motion.div
              className="flex flex-wrap justify-center lg:justify-start gap-2 mb-6 md:mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85, duration: 0.5 }}
            >
              {[
                "Alimentação",
                "Beleza",
                "Saúde",
                "Varejo",
                "Pet",
                "Infoprodutos",
              ].map((label) => (
                <span
                  key={label}
                  className="px-3 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary border border-primary/20"
                >
                  {label}
                </span>
              ))}
            </motion.div>

            <motion.div
              className="inline-flex flex-wrap items-center justify-center lg:justify-start gap-2 px-4 py-3 bg-glass rounded-xl mb-6 md:mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.5 }}
            >
              <span className="text-xs sm:text-sm text-muted-foreground">
                Sua loja online em
              </span>
              <span className="text-xs sm:text-sm font-semibold text-primary break-all">
                oseupedido.com.br/nomedaloja
              </span>
            </motion.div>

            <motion.div
              className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center lg:justify-start mb-8 md:mb-12"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.95, duration: 0.5 }}
            >
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
                <Button variant="hero" size="lg" asChild>
                  <a href="/auth?modo=criar">
                    Começar grátis
                  </a>
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
                <Button variant="heroOutline" size="lg" asChild>
                  <a href="#funcoes">
                    <Smartphone className="w-5 h-5" />
                    Ver demonstração
                  </a>
                </Button>
              </motion.div>
            </motion.div>

            {/* Destaques */}
            <div className="grid grid-cols-3 gap-3 sm:gap-6">
              {[
                { icon: TrendingUp, value: "0%", label: "Comissão sobre vendas" },
                { icon: Zap, value: "7 dias", label: "De teste grátis" },
                { icon: Users, value: "100%", label: "Da sua marca" },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.9 + i * 0.1,
                    duration: 0.4,
                  }}
                  className="text-center lg:text-left"
                >
                  <div className="flex items-center justify-center lg:justify-start gap-2 mb-1">
                    <stat.icon className="w-4 h-4 text-primary" />
                    <span className="text-xl sm:text-2xl font-bold text-foreground">
                      {stat.value}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {stat.label}
                  </span>
                </motion.div>
              ))}
            </div>

          </motion.div>

          {/* Image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="relative flex justify-center items-center mt-4 lg:mt-0"
          >
            <div className="relative w-full max-w-[280px] sm:max-w-[350px] md:max-w-[450px] lg:max-w-[550px] mx-auto">
              {/* Glow Effect - Static on mobile */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] sm:w-[300px] md:w-[400px] h-[200px] sm:h-[300px] md:h-[400px] bg-primary/20 blur-[60px] sm:blur-[80px] md:blur-[100px] rounded-full" />

              <motion.img
                src={welcomeImg}
                alt="App O Seu Pedido"
                width={460}
                height={407}
                fetchPriority="high"
                decoding="async"
                className="relative z-10 w-full h-auto object-contain drop-shadow-[0_10px_30px_rgba(239,68,68,0.3)] sm:drop-shadow-[0_20px_60px_rgba(239,68,68,0.3)]"
                animate={isMobile ? {} : { y: [0, -15, 0] }}
                transition={{
                  y: { duration: 4, repeat: Infinity, ease: "easeInOut" },
                }}
              />

              {/* Floating Cards - Simplified animations */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8, duration: 0.4 }}
                className="absolute left-0 sm:-left-4 md:-left-8 top-[20%] sm:top-1/3 bg-glass p-2 sm:p-3 md:p-4 rounded-lg sm:rounded-xl md:rounded-2xl shadow-elevated"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-gradient-primary rounded-md sm:rounded-lg md:rounded-xl flex items-center justify-center">
                    <Zap className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 text-primary-foreground" />
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs md:text-sm font-semibold">Novo pedido</p>
                    <p className="text-[8px] sm:text-[10px] md:text-xs text-muted-foreground">
                      Exemplo
                    </p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1, duration: 0.4 }}
                className="absolute right-0 sm:-right-4 md:-right-8 bottom-[20%] sm:bottom-1/4 bg-glass p-2 sm:p-3 md:p-4 rounded-lg sm:rounded-xl md:rounded-2xl shadow-elevated"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-secondary rounded-md sm:rounded-lg md:rounded-xl flex items-center justify-center">
                    <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs md:text-sm font-semibold">Painel único</p>
                    <p className="text-[8px] sm:text-[10px] md:text-xs text-muted-foreground">Tempo real</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Animated Bottom Wave */}
      <motion.div
        className="absolute bottom-0 left-0 right-0"
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ delay: 0.5, duration: 0.8 }}
      >
        <svg
          viewBox="0 0 1440 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full"
        >
          <motion.path
            d="M0 120L60 110C120 100 240 80 360 70C480 60 600 60 720 65C840 70 960 80 1080 85C1200 90 1320 90 1380 90L1440 90V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z"
            fill="hsl(var(--background))"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.5, delay: 0.8 }}
          />
        </svg>
      </motion.div>
    </section>
  );
};

export default Hero;
