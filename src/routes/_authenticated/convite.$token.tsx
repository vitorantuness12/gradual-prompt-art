import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { acceptStoreInvite, previewStoreInvite } from "@/lib/equipe.functions";
import { ROLE_LABEL, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/convite/$token")({
  component: InvitePage,
  head: () => ({
    meta: [
      { title: "Convite para equipe | O Seu Pedido" },
      { name: "description", content: "Aceite o convite para participar da equipe de uma loja no O Seu Pedido." },
    ],
  }),
});

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const preview = useServerFn(previewStoreInvite);
  const accept = useServerFn(acceptStoreInvite);

  const query = useQuery({
    queryKey: ["invite", token],
    queryFn: () => preview({ data: { token } }),
  });

  const mutation = useMutation({
    mutationFn: () => accept({ data: { token } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      void navigate({ to: "/painel" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <Logo />
        {query.isLoading ? (
          <Skeleton className="mt-6 h-28 rounded-xl" />
        ) : query.data?.ok ? (
          <>
            <h1 className="mt-6 text-2xl font-semibold text-foreground">
              Convite para {query.data.storeName}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Você foi convidado como <strong>{ROLE_LABEL[query.data.role ?? "staff"]}</strong> para o e-mail{" "}
              {query.data.email}. Válido até {query.data.expiresAt ? formatDate(query.data.expiresAt) : "a data de expiração"}.
            </p>
            <Button className="mt-6 w-full" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Confirmando..." : "Aceitar convite"}
            </Button>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-2xl font-semibold text-foreground">Convite indisponível</h1>
            <p className="mt-2 text-sm text-muted-foreground">{query.data?.message ?? "Convite não encontrado."}</p>
            <Button asChild variant="outline" className="mt-6 w-full">
              <Link to="/painel">Ir para o painel</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
