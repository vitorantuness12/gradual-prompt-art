import { HelpCircle, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

const TOPICS = [
  {
    question: "Preciso de cartão de crédito para começar?",
    answer: "Não. Você cria sua conta e monta o catálogo sem informar dados de pagamento.",
  },
  {
    question: "Como meus clientes acessam a loja?",
    answer: "Cada loja recebe um link próprio (/loja/sua-loja) que pode ser compartilhado ou virar QR Code.",
  },
  {
    question: "Onde acompanho os pedidos?",
    answer: "No painel, em Pedidos, com atualização de situação em poucos toques.",
  },
  {
    question: "Consigo usar em celular?",
    answer: "Sim. O painel e a loja pública são responsivos e funcionam bem no celular.",
  },
];

/** Central de dúvidas em formato de painel flutuante — conteúdo automatizado, sem atendimento humano. */
export function HelpWidget() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open ? (
        <div
          role="dialog"
          aria-label="Central de dúvidas"
          className="fixed right-3 bottom-20 z-40 max-h-[70vh] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-card-soft"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Central de dúvidas</h2>
              <p className="text-xs text-muted-foreground">
                Respostas automáticas. Não é atendimento humano em tempo real.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar central de dúvidas"
              className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <ul className="mt-3 space-y-3">
            {TOPICS.map((topic) => (
              <li key={topic.question} className="rounded-xl border border-border bg-background/60 p-3">
                <p className="text-sm font-medium text-foreground">{topic.question}</p>
                <p className="mt-1 text-sm text-muted-foreground">{topic.answer}</p>
              </li>
            ))}
          </ul>

          <a
            href="mailto:contato@seupedido.app"
            className="mt-3 inline-block text-sm text-primary underline-offset-4 hover:underline"
          >
            Ainda com dúvida? Escreva para contato@seupedido.app
          </a>
        </div>
      ) : null}

      <Button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Fechar central de dúvidas" : "Abrir central de dúvidas"}
        className="fixed right-3 bottom-3 z-40 size-12 rounded-full bg-gradient-primary p-0 text-primary-foreground shadow-glow transition-transform hover:scale-105"
      >
        <HelpCircle className="size-5" aria-hidden="true" />
      </Button>
    </>
  );
}
