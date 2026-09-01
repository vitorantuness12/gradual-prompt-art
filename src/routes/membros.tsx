import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, GraduationCap } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TITLE = "Acessar curso ou produto digital - O Seu Pedido";

export const Route = createFileRoute("/membros")({
  head: () => ({
    meta: [
      { title: TITLE },
      {
        name: "description",
        content: "Acesse a area de membros da loja onde voce comprou seu curso ou produto digital.",
      },
    ],
  }),
  component: MembrosEntradaPage,
});

function extractSlug(value: string): string {
  const trimmed = value.trim();
  const withoutProtocol = trimmed.replace("https://", "").replace("http://", "");
  const segments = withoutProtocol.split("/").filter(Boolean);
  let raw = segments[0] ?? "";
  if (raw.indexOf(".") !== -1 && segments.length > 1) {
    raw = segments[1] ?? "";
  }
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

function MembrosEntradaPage() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slug = extractSlug(value);
    if (!slug) {
      toast.error("Informe o nome ou o link da loja onde voce comprou.");
      return;
    }
    setLoading(true);
    void navigate({ to: "/$slug/membros", params: { slug } });
  }

  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <header className="mx-auto flex w-full max-w-5xl items-center px-4 py-6 sm:px-6">
        <Link to="/" aria-label="Voltar para a pagina inicial">
          <Logo />
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 pb-16 sm:px-6">
        <Card className="w-full max-w-md border-border/70 shadow-sm">
          <CardHeader>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <GraduationCap className="h-5 w-5" aria-hidden />
            </span>
            <CardTitle className="mt-3 text-xl">
              <h1 className="text-xl font-semibold">Acessar meu curso ou produto digital</h1>
            </CardTitle>
            <CardDescription>
              Digite o nome ou o link da loja onde voce comprou. Voce vai entrar com o e-mail usado na compra.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="loja">Nome ou link da loja</Label>
                <Input
                  id="loja"
                  placeholder="ex: minhaloja ou oseupedido.com/minhaloja"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  autoFocus
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Abrindo..." : "Continuar"}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Nao sabe o link? Ele esta no e-mail de liberacao que voce recebeu.
              </p>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
