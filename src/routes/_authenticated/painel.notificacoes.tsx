import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Pause, Play, Send, XCircle } from "lucide-react";
import { toast } from "sonner";

import { PushCampaignEditor, type PushCampaignDraft } from "@/components/painel/PushCampaignEditor";
import { EmptyState, PageHeader, StatCard } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveStore } from "@/hooks/useMyStores";
import { formatDateTime } from "@/lib/format";
import {
  PUSH_AUDIENCES,
  PUSH_SCHEDULES,
  PUSH_STATUS_LABEL,
  pushCampaignsKey,
  type PushCampaignSummary,
} from "@/lib/push-campaigns";
import {
  getPushCampaignOverview,
  savePushCampaign,
  sendCustomerPushTest,
  updatePushCampaignStatus,
} from "@/lib/push-campaigns.functions";

export const Route = createFileRoute("/_authenticated/painel/notificacoes")({
  component: PushNotificationsPage,
  head: () => ({
    meta: [
      { title: "Notificações push | Pedi Um" },
      {
        name: "description",
        content: "Crie e programe notificações para os clientes inscritos no app da sua loja.",
      },
      { property: "og:title", content: "Notificações push | Pedi Um" },
      {
        property: "og:description",
        content: "Mensagens, públicos, horários e resultados das notificações da sua loja.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function PushNotificationsPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const queryClient = useQueryClient();
  const overviewFn = useServerFn(getPushCampaignOverview);
  const saveFn = useServerFn(savePushCampaign);
  const statusFn = useServerFn(updatePushCampaignStatus);
  const testFn = useServerFn(sendCustomerPushTest);
  const overview = useQuery({
    queryKey: pushCampaignsKey(storeId),
    enabled: Boolean(storeId),
    queryFn: () => overviewFn({ data: { storeId: storeId as string } }),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: pushCampaignsKey(storeId) });
  const save = useMutation({
    mutationFn: (draft: PushCampaignDraft) =>
      saveFn({ data: { storeId: storeId as string, ...draft } }),
    onSuccess: (result) => {
      toast.success(result.status === "draft" ? "Rascunho salvo." : "Notificação programada.");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const action = useMutation({
    mutationFn: (input: {
      campaignId: string;
      action: "pause" | "resume" | "cancel" | "duplicate";
    }) => statusFn({ data: { storeId: storeId as string, ...input } }),
    onSuccess: () => {
      toast.success("Campanha atualizada.");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const test = useMutation({
    mutationFn: (content: { title: string; body: string }) =>
      testFn({ data: { storeId: storeId as string, ...content } }),
    onSuccess: (result) =>
      result.sent
        ? toast.success("Teste enviado para seu aparelho.")
        : toast.error("Ative as notificações do painel neste aparelho para testar."),
    onError: (error: Error) => toast.error(error.message),
  });

  if (!storeId)
    return (
      <EmptyState
        title="Escolha uma loja"
        description="Selecione a loja para gerenciar as notificações."
      />
    );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificações push"
        description="Envie novidades aos clientes que aceitaram receber avisos no app da sua loja."
      />
      {overview.isLoading ? (
        <Skeleton className="h-28 w-full" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Aparelhos inscritos" value={String(overview.data?.subscribers ?? 0)} />
          <StatCard label="Campanhas agendadas" value={String(overview.data?.scheduled ?? 0)} />
          <StatCard label="Entregues" value={String(overview.data?.sent ?? 0)} />
          <StatCard label="Falhas recentes" value={String(overview.data?.failed ?? 0)} />
        </div>
      )}
      <PushCampaignEditor
        busy={save.isPending || test.isPending}
        onSave={(draft) => save.mutate(draft)}
        onTest={(content) => test.mutate(content)}
      />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Campanhas</h2>
        {overview.isLoading ? (
          <Skeleton className="h-36" />
        ) : !overview.data?.campaigns.length ? (
          <EmptyState
            title="Nenhuma campanha criada"
            description="Crie a primeira mensagem acima."
          />
        ) : (
          <div className="grid gap-3">
            {overview.data.campaigns.map((campaign) => (
              <CampaignRow
                key={campaign.id}
                campaign={campaign}
                busy={action.isPending}
                onAction={(next) => action.mutate({ campaignId: campaign.id, action: next })}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CampaignRow({
  campaign,
  busy,
  onAction,
}: {
  campaign: PushCampaignSummary;
  busy: boolean;
  onAction: (action: "pause" | "resume" | "cancel" | "duplicate") => void;
}) {
  const audience =
    PUSH_AUDIENCES.find((item) => item.value === campaign.audienceType)?.label ??
    campaign.audienceType;
  const schedule =
    PUSH_SCHEDULES.find((item) => item.value === campaign.scheduleType)?.label ??
    campaign.scheduleType;
  return (
    <Card className="rounded-lg">
      <CardContent className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">{campaign.name}</h3>
            <Badge variant="outline">{PUSH_STATUS_LABEL[campaign.status]}</Badge>
          </div>
          <p className="mt-1 text-sm font-medium">{campaign.title}</p>
          <p className="line-clamp-2 text-sm text-muted-foreground">{campaign.body}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {audience} · {schedule}
            {campaign.nextRunAt ? ` · ${formatDateTime(campaign.nextRunAt)}` : ""} ·{" "}
            {campaign.sentCount} entregues
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            size="icon"
            variant="ghost"
            disabled={busy}
            aria-label="Duplicar campanha"
            onClick={() => onAction("duplicate")}
          >
            <Copy className="size-4" />
          </Button>
          {campaign.status === "scheduled" ? (
            <Button
              size="icon"
              variant="ghost"
              disabled={busy}
              aria-label="Pausar campanha"
              onClick={() => onAction("pause")}
            >
              <Pause className="size-4" />
            </Button>
          ) : campaign.status === "paused" ? (
            <Button
              size="icon"
              variant="ghost"
              disabled={busy}
              aria-label="Retomar campanha"
              onClick={() => onAction("resume")}
            >
              <Play className="size-4" />
            </Button>
          ) : null}
          {campaign.status === "draft" ? (
            <Button
              size="icon"
              variant="ghost"
              disabled={busy}
              aria-label="Programar campanha"
              onClick={() => onAction("resume")}
            >
              <Send className="size-4" />
            </Button>
          ) : null}
          {!(["sent", "cancelled"] as string[]).includes(campaign.status) ? (
            <Button
              size="icon"
              variant="ghost"
              disabled={busy}
              aria-label="Cancelar campanha"
              onClick={() => onAction("cancel")}
            >
              <XCircle className="size-4" />
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
