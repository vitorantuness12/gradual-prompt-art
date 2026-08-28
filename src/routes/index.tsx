import { createFileRoute } from "@tanstack/react-router";

import { CookieBanner } from "@/components/landing/CookieBanner";
import CTA from "@/components/landing2/CTA";
import FAQ from "@/components/landing2/FAQ";
import Features from "@/components/landing2/Features";
import Footer from "@/components/landing2/Footer";
import Hero from "@/components/landing2/Hero";
import HowItWorks from "@/components/landing2/HowItWorks";
import Integrations from "@/components/landing2/Integrations";
import Navbar from "@/components/landing2/Navbar";
import Pricing from "@/components/landing2/Pricing";
import Segments from "@/components/landing2/Segments";
import StoreUrl from "@/components/landing2/StoreUrl";
import Testimonials from "@/components/landing2/Testimonials";
import WhyUs from "@/components/landing2/WhyUs";

const TITLE = "O Seu Pedido — sua loja própria com pedidos, PDV e delivery";
const DESCRIPTION =
  "Loja própria em oseupedido.com.br/nomedaloja: pedidos, delivery, PDV, mesas, agenda, encomendas, estoque com lotes, pagamentos, entregadores, catálogo com IA e relatórios.";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://oseupedido.com.br/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://oseupedido.com.br/" }],
  }),

  component: LandingPage,
});

/** Landing page pública da plataforma. */
function LandingPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <Hero />
      <StoreUrl />
      <Segments />
      <WhyUs />
      <HowItWorks />
      <Features />
      <Integrations />
      <Testimonials />
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />
      <CookieBanner />
    </main>
  );
}
