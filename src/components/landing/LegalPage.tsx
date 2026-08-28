import { Link } from "@tanstack/react-router";

import { Logo } from "@/components/brand/Logo";

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalPageProps {
  title: string;
  updatedAt: string;
  sections: LegalSection[];
}

/** Layout compartilhado das páginas legais (termos, privacidade e cookies). */
export function LegalPage({ title, updatedAt, sections }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" aria-label="Voltar para a página inicial">
            <Logo />
          </Link>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            Voltar ao início
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{updatedAt}</p>

        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold text-foreground">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
