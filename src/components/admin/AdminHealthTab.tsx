import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, CircleAlert, CreditCard, FileText, MessageCircle, Webhook } from "lucide-react";

import { StatCard } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminHealthSnapshot } from "@/lib/superadmin.functions";

export function AdminHealthTab() {
  const getHealth = useServerFn(getAdminHealthSnapshot);
  const query = useQuery({ queryKey: ["admin-health"], queryFn: () => getHealth({}) });

  if (query.isLoading || !query.data) return <Skeleton className="h-80 rounded-lg" />;
  const health = query.data;
  const alerts = health.fiscal.errors + health.payments.failed + health.webhooks.failed + health.whatsapp.failedMessages + health.integrations.errors;

  const services = [
    { label: "Emissão fiscal", icon: FileText, healthy: health.fiscal.errors === 0, detail: `${health.fiscal.pending} pendente(s) · ${health.fiscal.errors} erro(s)` },
    { label: "Pagamentos", icon: CreditCard, healthy: health.payments.failed === 0, detail: `${health.payments.pending} pendente(s) · ${health.payments.failed} falha(s)` },
    { label: "Webhooks", icon: Webhook, healthy: health.webhooks.failed === 0, detail: `${health.webhooks.retrying} reenviando · ${health.webhooks.failed} falha(s)` },
    { label: "WhatsApp", icon: MessageCircle, healthy: health.whatsapp.failedMessages === 0 && health.whatsapp.connected > 0, detail: `${health.whatsapp.connected}/${health.whatsapp.total} conectado(s) · ${health.whatsapp.failedMessages} falha(s)` },
    { label: "Integrações globais", icon: Activity, healthy: health.integrations.errors === 0, detail: `${health.integrations.connected}/${health.integrations.total} conectada(s) · ${health.integrations.errors} erro(s)` },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Alertas nos últimos 30 dias" value={String(alerts)} hint={alerts ? "Requer revisão operacional" : "Operação saudável"} />
        <StatCard label="WhatsApp conectado" value={`${health.whatsapp.connected}/${health.whatsapp.total}`} />
        <StatCard label="Integrações conectadas" value={`${health.integrations.connected}/${health.integrations.total}`} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Saúde dos serviços</CardTitle>
          <CardDescription>Resumo operacional dos recursos usados pelas lojas.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {services.map((service) => (
            <div key={service.label} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border p-4">
              <service.icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-medium text-foreground">{service.label}</p>
                <p className="text-sm text-muted-foreground">{service.detail}</p>
              </div>
              <Badge variant={service.healthy ? "secondary" : "destructive"}>
                {service.healthy ? "Normal" : "Atenção"}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
        <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        <p>Este painel mostra falhas registradas pela plataforma. Credenciais e dados sensíveis permanecem protegidos no servidor.</p>
      </div>
    </div>
  );
}