import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

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

const TITLE = "Pedi Um | Loja Online, Pedidos, PDV e Gestão";
const DESCRIPTION =
  "Tenha sua própria loja online, receba pedidos, venda pelo PDV e controle estoque, clientes, pagamentos e operação em um só lugar. Tudo pra vender. Tudo em um.";

export const Route = createFileRoute("/")({
  beforeLoad: ({ location }) => {
    if (new URLSearchParams(location.searchStr).get("origem") === "app") {
      throw redirect({
        to: "/auth",
        search: {
          modo: "entrar",
          perfil: "lojista",
          origem: "app",
          redirect: "/painel/pedidos",
        },
        replace: true,
      });
    }
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Pedi Um — Tudo pra vender. Tudo em um." },
      {
        property: "og:description",
        content:
          "Loja online, pedidos, PDV, estoque e gestão em uma única plataforma para o seu negócio.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://oseupedido.com.br/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Pedi Um — Tudo pra vender. Tudo em um." },
      {
        name: "twitter:description",
        content:
          "Loja online, pedidos, PDV, estoque e gestão em uma única plataforma para o seu negócio.",
      },
    ],
    links: [
      { rel: "canonical", href: "https://oseupedido.com.br/" },
      { rel: "manifest", href: "/api/public/manifest" },
      { rel: "icon", type: "image/png", href: "/pedium-favicon.png" },
      { rel: "apple-touch-icon", href: "/pedium-apple-touch-icon.png" },
    ],
  }),

  component: LandingPage,
});

/** Landing page pública da plataforma. */
function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;

    void navigate({
      to: "/auth",
      search: {
        modo: "entrar",
        perfil: "lojista",
        origem: "app",
        redirect: "/painel/pedidos",
      },
      replace: true,
    });
  }, [navigate]);

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
