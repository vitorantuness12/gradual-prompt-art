import { Eye, RotateCcw, Save } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  defaultEntryPopupConfig,
  type EntryPopupConfig,
  type PopupKind,
  type RepeatPopupContent,
} from "@/lib/entry-popups";

/**
 * Card de configuração de uma janela de entrada.
 *
 * Tudo aqui mexe apenas no rascunho. O lojista salva quando quiser e só
 * publica depois de conferir a pré-visualização.
 */
interface Props {
  kind: PopupKind;
  title: string;
  description: string;
  config: EntryPopupConfig;
  onChange: (config: EntryPopupConfig) => void;
  onSave: () => void;
  onPublish: () => void;
  onPreview: () => void;
  saving: boolean;
  publishing: boolean;
  hasUnpublished: boolean;
  /** Conteúdo extra específico da janela (ex.: campanha de destaques). */
  children?: React.ReactNode;
}

const DISPLAY_MODES = [
  { value: "modal", label: "Somente modal" },
  { value: "section", label: "Somente seção dentro da loja" },
  { value: "both", label: "Modal e seção" },
  { value: "manual", label: "Somente acesso manual" },
  { value: "disabled", label: "Desativado" },
] as const;

const FREQUENCIES = [
  { value: "first_visit", label: "Toda primeira visita" },
  { value: "session", label: "Uma vez por sessão" },
  { value: "daily", label: "Uma vez por dia" },
  { value: "weekly", label: "Uma vez a cada 7 dias" },
  { value: "new_order", label: "Somente quando houver novo pedido elegível" },
  { value: "campaign", label: "Somente em campanha ativa" },
  { value: "never", label: "Nunca abrir automaticamente" },
] as const;

const DEVICES = [
  { value: "all", label: "Todos os dispositivos" },
  { value: "mobile", label: "Somente celular" },
  { value: "tablet", label: "Somente tablet" },
  { value: "desktop", label: "Somente computador" },
] as const;

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function EntryPopupCard({
  kind,
  title,
  description,
  config,
  onChange,
  onSave,
  onPublish,
  onPreview,
  saving,
  publishing,
  hasUnpublished,
  children,
}: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
  const set = (patch: Partial<EntryPopupConfig>) => onChange({ ...config, ...patch });
  const repeatContent = kind === "repeat" ? (config.content as RepeatPopupContent) : null;

  const setRepeat = (patch: Partial<RepeatPopupContent>) =>
    onChange({ ...config, content: { ...(config.content as RepeatPopupContent), ...patch } });

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {title}
              {hasUnpublished ? <Badge variant="secondary">Rascunho não publicado</Badge> : null}
              <Badge variant={config.enabled ? "default" : "outline"}>
                {config.enabled ? "Ativa" : "Desativada"}
              </Badge>
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`enable-${kind}`} className="text-sm">
              {config.enabled ? "Ativado" : "Desativado"}
            </Label>
            <Switch
              id={`enable-${kind}`}
              checked={config.enabled}
              onCheckedChange={(enabled) => set({ enabled })}
              aria-label={`Ativar janela ${title}`}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Onde aparece</Label>
            <Select value={config.displayMode} onValueChange={(value) => set({ displayMode: value as never })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISPLAY_MODES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Frequência de exibição</Label>
            <Select value={config.frequency} onValueChange={(value) => set({ frequency: value as never })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Dispositivo</Label>
            <Select value={config.device} onValueChange={(value) => set({ device: value as never })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEVICES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Ordem quando as duas estão ativas</Label>
            <Select value={String(config.priority)} onValueChange={(value) => set({ priority: Number(value) })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Aparece primeiro</SelectItem>
                <SelectItem value="2">Aparece depois</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Quando as duas são elegíveis</Label>
            <Select value={config.multiMode} onValueChange={(value) => set({ multiMode: value as never })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sequential">Sequencial (a segunda abre depois de fechar a primeira)</SelectItem>
                <SelectItem value="one_per_session">Somente uma por sessão</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`interval-${kind}`}>Intervalo mínimo entre exibições (minutos)</Label>
            <Input
              id={`interval-${kind}`}
              type="number"
              min={0}
              value={config.minIntervalMinutes}
              onChange={(event) => set({ minIntervalMinutes: Math.max(0, Number(event.target.value) || 0) })}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Abrir automaticamente</p>
            <p className="text-xs text-muted-foreground">
              Desligado, a janela abre somente quando o cliente clicar no botão da loja.
            </p>
          </div>
          <Switch
            checked={config.autoOpen}
            onCheckedChange={(autoOpen) => set({ autoOpen })}
            aria-label="Abrir automaticamente"
          />
        </div>

        <div className="space-y-3">
          <Label>Dias de exibição</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((label, day) => {
              const active = config.daysOfWeek.length === 0 || config.daysOfWeek.includes(day);
              return (
                <Button
                  key={label}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  onClick={() => {
                    const base =
                      config.daysOfWeek.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : [...config.daysOfWeek];
                    const next = base.includes(day) ? base.filter((item) => item !== day) : [...base, day];
                    set({ daysOfWeek: next.length === 7 ? [] : next.sort() });
                  }}
                >
                  {label}
                </Button>
              );
            })}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`start-${kind}`}>Das</Label>
              <Input
                id={`start-${kind}`}
                type="time"
                value={config.startTime}
                onChange={(event) => set({ startTime: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`end-${kind}`}>Até</Label>
              <Input
                id={`end-${kind}`}
                type="time"
                value={config.endTime}
                onChange={(event) => set({ endTime: event.target.value })}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Deixe os horários vazios para exibir o dia inteiro.
          </p>
        </div>

        {repeatContent ? (
          <>
            <Separator />
            <div className="space-y-4">
              <p className="text-sm font-medium text-foreground">Textos da janela</p>
              <div className="space-y-2">
                <Label htmlFor="repeat-title">Título</Label>
                <Input
                  id="repeat-title"
                  value={repeatContent.title}
                  onChange={(event) => setRepeat({ title: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="repeat-desc">Descrição</Label>
                <Textarea
                  id="repeat-desc"
                  rows={2}
                  value={repeatContent.description}
                  onChange={(event) => setRepeat({ description: event.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="repeat-placeholder">Placeholder do telefone</Label>
                  <Input
                    id="repeat-placeholder"
                    value={repeatContent.phonePlaceholder}
                    onChange={(event) => setRepeat({ phonePlaceholder: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="repeat-primary">Botão principal</Label>
                  <Input
                    id="repeat-primary"
                    value={repeatContent.primaryButton}
                    onChange={(event) => setRepeat({ primaryButton: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="repeat-secondary">Link secundário</Label>
                  <Input
                    id="repeat-secondary"
                    value={repeatContent.secondaryLink}
                    onChange={(event) => setRepeat({ secondaryLink: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="repeat-empty-button">Botão quando não há pedido</Label>
                  <Input
                    id="repeat-empty-button"
                    value={repeatContent.emptyButton}
                    onChange={(event) => setRepeat({ emptyButton: event.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="repeat-empty">Mensagem quando não há pedido</Label>
                <Textarea
                  id="repeat-empty"
                  rows={2}
                  value={repeatContent.emptyMessage}
                  onChange={(event) => setRepeat({ emptyMessage: event.target.value })}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="repeat-icon" className="text-sm">
                  Mostrar ícone de sacola
                </Label>
                <Switch
                  id="repeat-icon"
                  checked={repeatContent.showIcon}
                  onCheckedChange={(showIcon) => setRepeat({ showIcon })}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="repeat-dont-show" className="text-sm">
                  Oferecer “Não mostrar novamente”
                </Label>
                <Switch
                  id="repeat-dont-show"
                  checked={repeatContent.offerDontShowAgain}
                  onCheckedChange={(offerDontShowAgain) => setRepeat({ offerDontShowAgain })}
                />
              </div>
            </div>
          </>
        ) : null}

        {children}

        <Separator />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onPreview}>
            <Eye className="mr-2 size-4" aria-hidden="true" /> Pré-visualizar
          </Button>
          <Button variant="outline" onClick={onSave} disabled={saving}>
            <Save className="mr-2 size-4" aria-hidden="true" /> Salvar configuração
          </Button>
          <Button onClick={onPublish} disabled={publishing}>
            Publicar janela
          </Button>
          <Button
            variant={confirmReset ? "destructive" : "ghost"}
            onClick={() => {
              if (!confirmReset) {
                setConfirmReset(true);
                return;
              }
              onChange(defaultEntryPopupConfig(kind));
              setConfirmReset(false);
            }}
          >
            <RotateCcw className="mr-2 size-4" aria-hidden="true" />
            {confirmReset ? "Confirmar restauração" : "Restaurar padrão"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Salvar mantém em rascunho. Seus clientes só veem depois de publicar.
        </p>
      </CardContent>
    </Card>
  );
}
