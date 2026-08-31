import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, ExternalLink, Loader2, LogOut, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { DEFAULT_MEMBER_PASSWORD, checkNewPassword } from "@/lib/membros";
import { carregarMembro, linkMaterialMembro, loginMembro, sairMembro, trocarSenhaMembro } from "@/lib/membros.functions";

export const Route = createFileRoute("/$slug/membros")({
  component: MembrosPage,
  head: () => ({
    meta: [
      { title: "Área de membros | O Seu Pedido" },
      {
        name: "description",
        content: "Entre com seu e-mail para baixar os materiais dos produtos digitais que você comprou.",
      },
      { property: "og:title", content: "Área de membros" },
      { property: "og:description", content: "Acesse os materiais dos produtos digitais que você comprou." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STORAGE_KEY = "osp:membro-token";

function MembrosPage() {
  const { slug } = useParams({ from: "/$slug/membros" });
  const queryClient = useQueryClient();

  const doLogin = useServerFn(loginMembro);
  const loadContent = useServerFn(carregarMembro);
  const changePassword = useServerFn(trocarSenhaMembro);
  const resourceLink = useServerFn(linkMaterialMembro);
  const doLogout = useServerFn(sairMembro);

  const [token, setToken] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Só lemos o armazenamento do navegador depois da hidratação.
  useEffect(() => {
    setToken(window.localStorage.getItem(`${STORAGE_KEY}:${slug}`));
    setHydrated(true);
  }, [slug]);

  const contentQuery = useQuery({
    queryKey: ["membros-area", slug, token],
    enabled: Boolean(token),
    queryFn: () => loadContent({ data: { token: token! } }),
  });

  useEffect(() => {
    if (contentQuery.data && !contentQuery.data.ok) {
      window.localStorage.removeItem(`${STORAGE_KEY}:${slug}`);
      setToken(null);
    }
  }, [contentQuery.data, slug]);

  const loginMutation = useMutation({
    mutationFn: (input: { email: string; password: string }) => doLogin({ data: { slug, ...input } }),
    onSuccess: (result) => {
      if (!result.ok || !result.token) {
        toast.error(result.message);
        return;
      }
      window.localStorage.setItem(`${STORAGE_KEY}:${slug}`, result.token);
      setToken(result.token);
      toast.success("Acesso liberado.");
    },
    onError: () => toast.error("Não foi possível entrar agora."),
  });

  const passwordMutation = useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      changePassword({ data: { token: token!, ...input } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ["membros-area", slug, token] });
    },
    onError: () => toast.error("Não foi possível trocar a senha."),
  });

  async function openResource(resourceId: string) {
    const result = await resourceLink({ data: { token: token!, resourceId } });
    if (!result.ok || !result.url) {
      toast.error(result.message);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  async function logout() {
    if (token) await doLogout({ data: { token } });
    window.localStorage.removeItem(`${STORAGE_KEY}:${slug}`);
    setToken(null);
  }

  if (!hydrated) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <Skeleton className="h-64 rounded-2xl" />
      </main>
    );
  }

  const session = contentQuery.data?.ok ? contentQuery.data.session : undefined;

  if (!token || !session) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <h1 className="mb-1 text-2xl font-bold text-foreground">Área de membros</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Entre com o e-mail usado na compra. A senha inicial vai no e-mail de liberação.
        </p>
        <LoginForm onSubmit={(values) => loginMutation.mutate(values)} pending={loginMutation.isPending} />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{session.storeName}</h1>
          <p className="text-sm text-muted-foreground">Conectado como {session.email}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void logout()}>
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </Button>
      </header>

      {session.mustChangePassword ? (
        <Alert className="mb-6">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Troque sua senha</AlertTitle>
          <AlertDescription>
            Você está usando a senha padrão ({DEFAULT_MEMBER_PASSWORD}). Defina uma senha só sua agora.
          </AlertDescription>
        </Alert>
      ) : null}

      <ChangePasswordCard
        pending={passwordMutation.isPending}
        highlight={session.mustChangePassword}
        onSubmit={(values) => passwordMutation.mutate(values)}
      />

      <section className="mt-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Seus produtos</h2>
        {contentQuery.isLoading ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : session.products.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum produto liberado ainda. Assim que o pagamento for confirmado, ele aparece aqui.
          </p>
        ) : (
          session.products.map((product) => (
            <Card key={product.productId}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">{product.productName}</CardTitle>
                  {product.blocked ? <Badge variant="destructive">Indisponível</Badge> : <Badge>Liberado</Badge>}
                </div>
                <CardDescription>
                  {product.blocked
                    ? product.blockedReason
                    : product.releasedAt
                      ? `Liberado em ${formatDateTime(product.releasedAt)}`
                      : "Liberado"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {product.instructions ? (
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{product.instructions}</p>
                ) : null}
                {product.blocked ? null : product.resources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">A loja ainda não publicou materiais deste produto.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {product.resources.map((resource) => (
                      <li key={resource.id} className="flex items-center justify-between gap-3 p-3">
                        <span className="min-w-0 truncate text-sm text-foreground">{resource.title}</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => void openResource(resource.id)}>
                          {resource.kind === "link" ? (
                            <ExternalLink className="mr-2 h-4 w-4" />
                          ) : (
                            <Download className="mr-2 h-4 w-4" />
                          )}
                          {resource.kind === "link" ? "Abrir" : "Baixar"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </main>
  );
}

function LoginForm({
  onSubmit,
  pending,
}: {
  onSubmit: (values: { email: string; password: string }) => void;
  pending: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="grid gap-2">
          <Label htmlFor="membro-email">E-mail da compra</Label>
          <Input
            id="membro-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="membro-senha">Senha</Label>
          <Input
            id="membro-senha"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <Button
          type="button"
          className="w-full"
          disabled={pending || !email || !password}
          onClick={() => onSubmit({ email, password })}
        >
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Entrar
        </Button>
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard({
  onSubmit,
  pending,
  highlight,
}: {
  onSubmit: (values: { currentPassword: string; newPassword: string }) => void;
  pending: boolean;
  highlight: boolean;
}) {
  const [open, setOpen] = useState(highlight);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const check = checkNewPassword(newPassword);

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Trocar minha senha
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trocar senha</CardTitle>
        <CardDescription>Use pelo menos 8 caracteres e algo diferente da senha padrão.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="senha-atual">Senha atual</Label>
          <Input
            id="senha-atual"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="senha-nova">Nova senha</Label>
          <Input
            id="senha-nova"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          {newPassword && !check.ok ? <p className="text-xs text-destructive">{check.message}</p> : null}
        </div>
        <Button
          type="button"
          disabled={pending || !currentPassword || !check.ok}
          onClick={() => onSubmit({ currentPassword, newPassword })}
        >
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Salvar nova senha
        </Button>
      </CardContent>
    </Card>
  );
}
