import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount, exportMyData } from "@/lib/privacidade.functions";

export const Route = createFileRoute("/_authenticated/painel/privacidade")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacidade e dados | O Seu Pedido" },
      { name: "description", content: "Exporte ou exclua os seus dados pessoais e conheça a política de retenção." },
    ],
  }),
});

function PrivacyPage() {
  const navigate = useNavigate();
  const exportFn = useServerFn(exportMyData);
  const deleteFn = useServerFn(deleteMyAccount);
  const [confirmation, setConfirmation] = useState("");

  const exportMutation = useMutation({
    mutationFn: () => exportFn({}),
    onSuccess: (result) => {
      if (!result.ok || !result.json) {
        toast.error(result.message);
        return;
      }
      const blob = new Blob([result.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `seus-dados-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Arquivo gerado com os seus dados.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteFn({ data: { confirmation } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      await supabase.auth.signOut();
      void navigate({ to: "/", replace: true });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader
        title="Privacidade e dados"
        description="Direitos do titular previstos na LGPD: acesso, portabilidade e eliminação dos dados."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="size-4 text-primary" aria-hidden="true" />
              Exportar meus dados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Baixe um arquivo JSON com o seu perfil, papéis, lojas, equipes, assinaturas e solicitações anteriores.
              Dados de clientes das lojas não entram nesse arquivo — eles pertencem a cada loja.
            </p>
            <Button onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
              {exportMutation.isPending ? "Gerando..." : "Baixar meus dados"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-destructive/40 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="size-4 text-destructive" aria-hidden="true" />
              Excluir minha conta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              A exclusão remove o seu perfil, vínculos de equipe e lojas sem pedidos reais. Lojas com histórico de
              vendas precisam ser transferidas antes, por obrigação fiscal e contábil.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="confirmar-exclusao">Digite EXCLUIR para confirmar</Label>
              <Input
                id="confirmar-exclusao"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="EXCLUIR"
                aria-describedby="ajuda-exclusao"
              />
              <p id="ajuda-exclusao" className="text-xs">
                Esta ação é permanente e registrada na auditoria.
              </p>
            </div>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending || confirmation.trim().toUpperCase() !== "EXCLUIR"}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir conta e dados"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Política de retenção</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ul className="list-disc space-y-1 pl-5">
            <li>Pedidos, pagamentos e notas: mantidos por 5 anos (obrigação fiscal).</li>
            <li>Conversas e mensagens de atendimento: 12 meses após o último contato.</li>
            <li>Registros de auditoria e webhooks: 12 meses.</li>
            <li>Contadores de limite de tentativas: 24 horas.</li>
            <li>Dados de cadastro: enquanto a conta existir; excluídos a pedido do titular.</li>
            <li>Consentimento de cookies: registrado no navegador e revogável a qualquer momento no rodapé do site.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
