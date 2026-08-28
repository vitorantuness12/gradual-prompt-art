import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import logo from "@/assets/logo.png";
import { ThemeToggle } from "@/components/painel/ThemeToggle";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);

  const links = [
    { label: "Home", href: "#" },
    { label: "Sua URL", href: "#url-propria" },
    { label: "Segmentos", href: "#segmentos" },
    { label: "Como funciona", href: "#como-funciona" },
    { label: "Funções", href: "#funcoes" },
    { label: "Integrações", href: "#integracoes" },
    { label: "Preços", href: "#precos" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 z-50"
    >
      <div className="mx-3 mt-3 sm:mx-4 sm:mt-4">
        <nav className="container bg-glass rounded-2xl px-4 py-3 sm:px-6 sm:py-4 max-h-[85svh] overflow-y-auto">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 lg:flex lg:justify-between">
            {/* Logo */}
            <a href="/" aria-label="Página inicial do O Seu Pedido" className="flex min-w-0 shrink-0 items-center">
              <img src={logo} alt="O Seu Pedido" className="h-10 sm:h-12 lg:h-14 w-auto" />
            </a>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-6 xl:gap-8">
              {links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* Desktop CTA */}
            <div className="hidden lg:flex items-center gap-4">
              <ThemeToggle />
              <Button variant="ghost" size="sm" asChild>
                <a href="/auth?modo=entrar">
                  Entrar
                </a>
              </Button>
              <Button variant="default" size="sm" asChild>
                <a href="/auth?modo=criar">
                  Criar minha loja
                </a>
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <div className="lg:hidden flex shrink-0 items-center gap-1">
              <ThemeToggle />
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 text-foreground"
                aria-label={isOpen ? "Fechar menu" : "Abrir menu"}
              >
                {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden mt-4 pt-4 border-t border-border"
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Button variant="default" asChild>
                    <a href="/auth?modo=criar" onClick={() => setIsOpen(false)}>
                      Criar minha loja
                    </a>
                  </Button>
                  <Button variant="outline" asChild>
                    <a href="/auth?modo=entrar" onClick={() => setIsOpen(false)}>
                      Entrar
                    </a>
                  </Button>
                </div>
                <div className="flex flex-col gap-1 border-t border-border pt-3">
                  {links.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      className="text-muted-foreground hover:text-foreground transition-colors py-2"
                      onClick={() => setIsOpen(false)}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </nav>
      </div>
    </motion.header>
  );
};

export default Navbar;
