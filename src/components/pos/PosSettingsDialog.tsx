import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { KDS_STATIONS, type PosKdsSettings } from "@/lib/pos-kds";
import type { SettingsScope } from "@/hooks/usePosKdsSettings";
import { useState } from "react";

interface PosSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: PosKdsSettings;
  /** Mostra os campos exclusivos do KDS. */
  showKdsOptions: boolean;
  hasTerminalOverride: boolean;
  isSaving: boolean;
  onSave: (patch: Partial<PosKdsSettings>, scope: SettingsScope) => void;
  onResetTerminal: () => void;
}

/**
 * Configurações do PDV e do KDS. Podem valer para toda a loja ou apenas para
 * este terminal, sem afetar os outros operadores.
 */
export function PosSettingsDialog({
  open,
  onOpenChange,
  settings,
  showKdsOptions,
  hasTerminalOverride,
  isSaving,
  onSave,
  onResetTerminal,
}: PosSettingsDialogProps) {
  const [scope, setScope] = useState<SettingsScope>("store");

  function update(patch: Partial<PosKdsSettings>) {
    onSave(patch, scope);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurações</DialogTitle>
          <DialogDescription>
            As mudanças salvam na hora. Escolha se valem para a loja inteira ou apenas para este terminal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="cfg-escopo">Aplicar em</Label>
          <Select value={scope} onValueChange={(value) => setScope(value as SettingsScope)}>
            <SelectTrigger id="cfg-escopo" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="store">Toda a loja</SelectItem>
              <SelectItem value="terminal">Somente este terminal</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        <div className="space-y-4">
          <Row label="Tema">
            <Select value={settings.theme} onValueChange={(value) => update({ theme: value as PosKdsSettings["theme"] })}>
              <SelectTrigger className="h-10 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Claro</SelectItem>
                <SelectItem value="dark">Escuro</SelectItem>
              </SelectContent>
            </Select>
          </Row>

          <Row label="Densidade da interface">
            <Select value={settings.density} onValueChange={(value) => update({ density: value as PosKdsSettings["density"] })}>
              <SelectTrigger className="h-10 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compacta</SelectItem>
                <SelectItem value="comfortable">Confortável</SelectItem>
                <SelectItem value="spacious">Espaçosa</SelectItem>
              </SelectContent>
            </Select>
          </Row>

          <Row label="Tamanho dos cards">
            <Select value={settings.cardSize} onValueChange={(value) => update({ cardSize: value as PosKdsSettings["cardSize"] })}>
              <SelectTrigger className="h-10 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">Pequeno</SelectItem>
                <SelectItem value="md">Médio</SelectItem>
                <SelectItem value="lg">Grande</SelectItem>
              </SelectContent>
            </Select>
          </Row>

          <Row label="Mostrar imagens dos produtos">
            <Switch checked={settings.showProductImages} onCheckedChange={(value) => update({ showProductImages: value })} />
          </Row>

          <Row label="Terminal">
            <Input
              className="h-10 w-40"
              defaultValue={settings.terminal}
              onBlur={(event) => update({ terminal: event.target.value.trim() || "Caixa 1" })}
            />
          </Row>

          <Row label="Atualização automática (segundos)">
            <Input
              className="h-10 w-24"
              inputMode="numeric"
              defaultValue={settings.autoRefreshSeconds}
              onBlur={(event) => update({ autoRefreshSeconds: Number(event.target.value) || 20 })}
            />
          </Row>

          <Row label="Impressão automática de novos pedidos">
            <Switch checked={settings.autoPrint} onCheckedChange={(value) => update({ autoPrint: value })} />
          </Row>

          <Row label="Impressão separada por setor">
            <Switch checked={settings.printByStation} onCheckedChange={(value) => update({ printByStation: value })} />
          </Row>

          <Row label="Ocultar produtos esgotados">
            <Switch checked={settings.hideOutOfStock} onCheckedChange={(value) => update({ hideOutOfStock: value })} />
          </Row>

          {showKdsOptions ? (
            <>
              <Separator />

              <Row label="Setor deste monitor">
                <Select value={settings.station} onValueChange={(value) => update({ station: value })}>
                  <SelectTrigger className="h-10 w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todos os setores</SelectItem>
                    {KDS_STATIONS.map((station) => (
                      <SelectItem key={station.value} value={station.value}>
                        {station.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>

              <Row label="Setor pode concluir o pedido inteiro">
                <Switch
                  checked={settings.stationCanCompleteOrder}
                  onCheckedChange={(value) => update({ stationCanCompleteOrder: value })}
                />
              </Row>

              <Row label="Alerta amarelo a partir de (min)">
                <Input
                  className="h-10 w-24"
                  inputMode="numeric"
                  defaultValue={settings.warningMinutes}
                  onBlur={(event) => update({ warningMinutes: Number(event.target.value) || 15 })}
                />
              </Row>

              <Row label="Considerar atrasado após (min)">
                <Input
                  className="h-10 w-24"
                  inputMode="numeric"
                  defaultValue={settings.lateMinutes}
                  onBlur={(event) => update({ lateMinutes: Number(event.target.value) || 25 })}
                />
              </Row>

              <Row label="Meta de tempo de preparo (min)">
                <Input
                  className="h-10 w-24"
                  inputMode="numeric"
                  defaultValue={settings.maxPrepMinutes}
                  onBlur={(event) => update({ maxPrepMinutes: Number(event.target.value) || 40 })}
                />
              </Row>

              <Row label="Som ao chegar pedido novo">
                <Switch checked={settings.soundEnabled} onCheckedChange={(value) => update({ soundEnabled: value })} />
              </Row>

              {settings.soundEnabled ? (
                <div className="space-y-2">
                  <Label>Volume do alerta</Label>
                  <Slider
                    value={[Math.round(settings.soundVolume * 100)]}
                    max={100}
                    step={5}
                    onValueChange={([value]) => update({ soundVolume: (value ?? 40) / 100 })}
                  />
                </div>
              ) : null}

              <Row label="Mostrar preços no KDS">
                <Switch checked={settings.showPrices} onCheckedChange={(value) => update({ showPrices: value })} />
              </Row>
              <Row label="Mostrar nome do cliente">
                <Switch checked={settings.showCustomerName} onCheckedChange={(value) => update({ showCustomerName: value })} />
              </Row>
              <Row label="Mostrar observações">
                <Switch checked={settings.showNotes} onCheckedChange={(value) => update({ showNotes: value })} />
              </Row>

              <Row label="Ordem dos pedidos">
                <Select value={settings.kdsSort} onValueChange={(value) => update({ kdsSort: value as PosKdsSettings["kdsSort"] })}>
                  <SelectTrigger className="h-10 w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oldest">Mais antigos primeiro</SelectItem>
                    <SelectItem value="newest">Mais novos primeiro</SelectItem>
                    <SelectItem value="priority">Prioridade</SelectItem>
                    <SelectItem value="delay">Maior atraso</SelectItem>
                  </SelectContent>
                </Select>
              </Row>

              <Row label="Agrupamento">
                <Select value={settings.kdsGroup} onValueChange={(value) => update({ kdsGroup: value as PosKdsSettings["kdsGroup"] })}>
                  <SelectTrigger className="h-10 w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem agrupar</SelectItem>
                    <SelectItem value="station">Por setor</SelectItem>
                    <SelectItem value="channel">Por canal</SelectItem>
                    <SelectItem value="type">Por tipo</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
            </>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {hasTerminalOverride ? (
            <Button variant="ghost" onClick={onResetTerminal} disabled={isSaving}>
              Voltar a usar o padrão da loja
            </Button>
          ) : null}
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}
