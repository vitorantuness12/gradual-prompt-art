import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  FISCAL_ENVIRONMENTS,
  FISCAL_PROVIDERS,
  TAX_REGIMES,
  fiscalConfigKey,
  providerNeedsCompany,
  type FiscalConfig,
} from "@/lib/fiscal";
import { saveFiscalSettings, testFiscalProvider } from "@/lib/fiscal.functions";

export interface FiscalSettingsCardProps {
  storeId: string;
  config: FiscalConfig;
}

interface FormState {
  provider: string;
  environment: string;
  autoIssue: boolean;
  cnpj: string;
  municipalRegistration: string;
  serviceCode: string;
  cnae: string;
  taxRegime: string;
  taxPercent: string;
  defaultDescription: string;
  apiKey: string;
  companyId: string;
}

function initialForm(config: FiscalConfig): FormState {
  const settings = config.settings;
  return {
    provider: config.connection.provider,
    environment: settings?.environment ?? "homologacao",
    autoIssue: settings?.auto_issue ?? false,
    cnpj: settings?.cnpj ?? "",
    municipalRegistration: settings?.municipal_registration ?? "",
    serviceCode: settings?.service_code ?? "",
    cnae: settings?.cnae ?? "",
    taxRegime: settings?.tax_regime ?? "simples_nacional",
    taxPercent: String(settings?.tax_percent ?? 0),
    defaultDescription: settings?.default_description ?? "",
    apiKey: "",
    companyId: config.connection.companyId ?? "",
  };
}

/** Dados da empresa, emissor conectado e ambiente de emissão. */
export function FiscalSettingsCard({ storeId, config }: FiscalSettingsCardProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialForm(config));

  useEffect(() => {
    setForm(initialForm(config));
  }, [config]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const save = useMutation({
    mutationFn: async () => {
      const result = await saveFiscalSettings({
        data: {
          storeId,
          provider: form.provider as "manual" | "focus_nfe" | "nfe_io" | "enotas",
          environment: form.environment as "homologacao" | "producao",
          autoIssue: form.autoIssue,
          cnpj: form.cnpj,
          municipalRegistration: form.municipalRegistration,
          serviceCode: form.serviceCode,
          cnae: form.cnae,
          taxRegime: form.taxRegime,
          taxPercent: Number(form.taxPercent.replace(",", ".")) || 0,
          defaultDescription: form.defaultDescription,
          apiKey: form.apiKey,
          companyId: form.companyId,
        },
      });
      if (!result.ok) throw new Error(result.message);
      return result.message;
    },
    onSuccess: async (message) => {
      toast.success(message);
      await queryClient.invalidateQueries({ queryKey: fiscalConfigKey(storeId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const test = useMutation({
    mutationFn: () => testFiscalProvider({ data: { storeId } }),
    onSuccess: (result) => (result.ok ? toast.success(result.message) : toast.error(result.message)),
    onError: () => toast.error("Não foi possível falar com o emissor."),
  });

  const needsCompany = providerNeedsCompany(form.provider);
  const isManual = form.provider === "manual";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuração da nota</CardTitle>
        <CardDescription>
          {isManual
            ? "Sem emissor conectado a nota fica apenas registrada aqui, para conferência."
            : "Com o emissor conectado cada pedido pode virar uma nota de verdade."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>Emissor</Label>
            <Select value={form.provider} onValueChange={(value) => update("provider", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FISCAL_PROVIDERS.map((provider) => (
                  <SelectItem key={provider.value} value={provider.value}>{provider.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Ambiente</Label>
            <Select value={form.environment} onValueChange={(value) => update("environment", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FISCAL_ENVIRONMENTS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!isManual && (
          <div className="grid gap-4 rounded-lg border border-border bg-muted/40 p-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Credencial do emissor</Label>
              <Input
                type="password"
                value={form.apiKey}
                onChange={(event) => update("apiKey", event.target.value)}
                placeholder={config.connection.maskedKey ?? "cole o token aqui"}
              />
              <p className={cn("text-xs", config.connection.configured ? "text-muted-foreground" : "text-destructive")}>
                {config.connection.configured
                  ? "Já salva. Deixe em branco para manter."
                  : "Obrigatória para emitir notas de verdade."}
              </p>
            </div>
            {needsCompany && (
              <div className="grid gap-2">
                <Label>ID da empresa no emissor</Label>
                <Input value={form.companyId} onChange={(event) => update("companyId", event.target.value)} />
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>CNPJ</Label>
            <Input value={form.cnpj} onChange={(event) => update("cnpj", event.target.value)} placeholder="00.000.000/0000-00" />
          </div>
          <div className="grid gap-2">
            <Label>Inscrição municipal</Label>
            <Input value={form.municipalRegistration} onChange={(event) => update("municipalRegistration", event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Regime tributário</Label>
            <Select value={form.taxRegime} onValueChange={(value) => update("taxRegime", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TAX_REGIMES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Imposto sobre o serviço (%)</Label>
            <Input value={form.taxPercent} onChange={(event) => update("taxPercent", event.target.value)} inputMode="decimal" />
          </div>
          <div className="grid gap-2">
            <Label>Código do serviço (LC 116)</Label>
            <Input value={form.serviceCode} onChange={(event) => update("serviceCode", event.target.value)} placeholder="ex.: 14.01" />
          </div>
          <div className="grid gap-2">
            <Label>CNAE</Label>
            <Input value={form.cnae} onChange={(event) => update("cnae", event.target.value)} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Descrição padrão da nota</Label>
          <Textarea
            value={form.defaultDescription}
            onChange={(event) => update("defaultDescription", event.target.value)}
            placeholder="Ex.: Serviço prestado conforme pedido."
            rows={2}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Emitir automaticamente</p>
            <p className="text-xs text-muted-foreground">Gera a nota assim que o pedido é pago.</p>
          </div>
          <Switch checked={form.autoIssue} onCheckedChange={(value) => update("autoIssue", value)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando..." : "Salvar configuração"}
          </Button>
          {!isManual && (
            <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending || !config.connection.configured}>
              {test.isPending ? "Testando..." : "Testar conexão"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
