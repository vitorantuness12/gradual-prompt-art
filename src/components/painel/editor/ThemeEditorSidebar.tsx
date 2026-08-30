import { AlertTriangle, Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ImageUploadField } from "@/components/store/ImageUploadField";
import { Button } from "@/components/ui/button";
import { uploadStoreImage } from "@/lib/image-upload";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  contrastWarnings,
  isValidHex,
  paletteFromPrimary,
  resolvedFooterColors,
  THEME_PRESETS,
  type ButtonShape,
  type CardStyle,
  type ImagePosition,
  type ShadowLevel,
  type StoreThemeColors,
  type StoreThemeConfig,
} from "@/lib/store-theme";

/**
 * Controles de personalização visual da loja.
 *
 * Toda mudança altera apenas o rascunho; o cliente só vê depois de publicar.
 */
interface Props {
  config: StoreThemeConfig;
  onChange: (next: StoreThemeConfig) => void;
  storeId?: string | null;
}

const QUICK_COLORS: { label: string; value: string }[] = [
  { label: "Vermelho", value: "#dc2626" },
  { label: "Laranja", value: "#ea580c" },
  { label: "Amarelo", value: "#d97706" },
  { label: "Verde", value: "#16a34a" },
  { label: "Verde escuro", value: "#065f46" },
  { label: "Azul", value: "#2563eb" },
  { label: "Azul marinho", value: "#1e3a8a" },
  { label: "Roxo", value: "#7c3aed" },
  { label: "Rosa", value: "#db2777" },
  { label: "Marrom", value: "#78350f" },
  { label: "Cinza escuro", value: "#334155" },
  { label: "Preto", value: "#111827" },
];

const COLOR_FIELDS: { key: keyof StoreThemeColors; label: string }[] = [
  { key: "primary", label: "Cor principal" },
  { key: "secondary", label: "Cor secundária" },
  { key: "accent", label: "Cor de destaque" },
  { key: "background", label: "Fundo da loja" },
  { key: "card", label: "Fundo dos cards" },
  { key: "text", label: "Texto principal" },
  { key: "mutedText", label: "Texto secundário" },
  { key: "badge", label: "Selos e etiquetas" },
  { key: "statusOpen", label: "Status aberto" },
  { key: "statusClosed", label: "Status fechado" },
  { key: "statusScheduling", label: "Status agendamento" },
  { key: "statusUnavailable", label: "Item indisponível" },
];

export function ThemeEditorSidebar({ config, onChange, storeId }: Props) {
  const warnings = contrastWarnings(config.colors);
  const [uploading, setUploading] = useState(false);

  const patch = (partial: Partial<StoreThemeConfig>) => onChange({ ...config, ...partial });
  const setColor = (key: keyof StoreThemeColors, value: string) =>
    patch({ colors: { ...config.colors, [key]: value } });
  const setFooter = (partial: Partial<StoreThemeConfig["footer"]>) =>
    patch({ footer: { ...config.footer, ...partial } });
  /** Uma escolha de cor ajusta a paleta inteira e o rodapé volta a seguir a cor principal. */
  const applyPrimary = (value: string) =>
    patch({
      colors: paletteFromPrimary(value),
      footer: { ...config.footer, background: null, text: null },
    });
  /** Cores efetivas do rodapé (personalizadas ou derivadas da cor principal). */
  const footerColors = resolvedFooterColors(config.footer, config.colors.primary);
  const footerCustomized = Boolean(config.footer.background || config.footer.text);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Temas prontos</h3>
        <p className="text-xs text-muted-foreground">Um ponto de partida. Você pode ajustar tudo depois.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => onChange({ ...preset.config, branding: config.branding })}
              className="rounded-lg border border-border bg-card p-3 text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-2">
                <span className="size-4 rounded-full" style={{ background: preset.config.colors.primary }} aria-hidden="true" />
                <span className="text-sm font-medium">{preset.name}</span>
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{preset.description}</span>
            </button>
          ))}
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Cor da sua loja</h3>
        <p className="text-xs text-muted-foreground">
          Escolha uma cor. O resto (fundos, textos e selos) é ajustado automaticamente para ficar legível.
        </p>

        <div className="flex flex-wrap gap-2">
          {QUICK_COLORS.map((color) => {
            const selected = config.colors.primary.toLowerCase() === color.value.toLowerCase();
            return (
              <button
                key={color.value}
                type="button"
                title={color.label}
                aria-label={color.label}
                aria-pressed={selected}
                onClick={() => applyPrimary(color.value)}
                className={cn(
                  "size-9 rounded-full border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "border-foreground scale-110" : "border-border hover:scale-105",
                )}
                style={{ background: color.value }}
              />
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <input
            id="color-primary"
            type="color"
            value={isValidHex(config.colors.primary) ? config.colors.primary : "#000000"}
            onChange={(event) => applyPrimary(event.target.value)}
            className="h-9 w-10 cursor-pointer rounded border border-border bg-card"
            aria-label="Escolher outra cor"
          />
          <Label htmlFor="color-primary" className="text-xs text-muted-foreground">
            Ou escolha outra cor
          </Label>
        </div>

        {warnings.length > 0 ? (
          <Alert>
            <AlertTriangle className="size-4" aria-hidden="true" />
            <AlertDescription>
              <ul className="list-disc pl-4 text-xs">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : (
          <p className="text-xs text-muted-foreground">Contraste dentro do recomendado para leitura.</p>
        )}

        <details className="rounded-lg border border-border bg-card p-3">
          <summary className="cursor-pointer text-xs font-medium text-foreground">
            Ajustes avançados de cores (opcional)
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {COLOR_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={`color-${field.key}`} className="text-xs">
                  {field.label}
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    id={`color-${field.key}`}
                    type="color"
                    value={isValidHex(config.colors[field.key]) ? config.colors[field.key] : "#000000"}
                    onChange={(event) => setColor(field.key, event.target.value)}
                    className="h-9 w-10 cursor-pointer rounded border border-border bg-card"
                    aria-label={field.label}
                  />
                  <Input
                    value={config.colors[field.key]}
                    onChange={(event) => setColor(field.key, event.target.value)}
                    className="h-9 text-xs"
                    aria-label={`${field.label} em hexadecimal`}
                  />
                </div>
              </div>
            ))}
            <ColorField
              label="Fundo do rodapé"
              value={footerColors.background}
              onChange={(value) => setFooter({ background: value })}
            />
            <ColorField
              label="Texto do rodapé"
              value={footerColors.text}
              onChange={(value) => setFooter({ text: value })}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {footerCustomized
              ? "O rodapé está com cores personalizadas."
              : "O rodapé acompanha automaticamente a cor principal da loja."}
          </p>
          {footerCustomized ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() => setFooter({ background: null, text: null })}
            >
              Voltar a seguir a cor principal
            </Button>
          ) : null}
        </details>
      </section>


      <Separator />

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Imagens</h3>
        <p className="text-xs text-muted-foreground">
          Logo e capa aparecem no topo da loja pública. A capa do app é usada quando o cliente instala a loja no
          celular (use uma imagem quadrada, mínimo 512×512).
        </p>

        <ImageUploadField
          storeId={storeId ?? null}
          kind="logo"
          label="Logo da loja"
          value={config.branding.logoUrl}
          onChange={(url) => patch({ branding: { ...config.branding, logoUrl: url } })}
          hint="Imagem quadrada, exibida no card de perfil da loja."
        />

        <ImageUploadField
          storeId={storeId ?? null}
          kind="cover"
          label="Capa da loja"
          value={config.branding.coverUrl}
          onChange={(url) => patch({ branding: { ...config.branding, coverUrl: url } })}
          hint="Imagem horizontal (1600×900) exibida no topo da loja."
        />

        <div className="flex items-center gap-3">
          {config.branding.faviconUrl ? (
            <img
              src={config.branding.faviconUrl}
              alt="Capa do app PWA"
              className="size-16 shrink-0 rounded-xl border border-border object-cover"
            />
          ) : (
            <div className="grid size-16 shrink-0 place-items-center rounded-xl border border-dashed border-border text-muted-foreground">
              <ImageIcon className="size-5" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 space-y-2">
            <Label htmlFor="branding-pwa" className="text-xs">
              Capa do app (PWA)
            </Label>
            <Input
              id="branding-pwa"
              type="file"
              accept="image/*"
              disabled={!storeId || uploading}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file || !storeId) return;
                setUploading(true);
                try {
                  const url = await uploadStoreImage(storeId, "logo", file);
                  patch({ branding: { ...config.branding, faviconUrl: url } });
                  toast.success("Imagem enviada.");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Falha ao enviar a imagem.");
                } finally {
                  setUploading(false);
                }
              }}
            />
            {config.branding.faviconUrl ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => patch({ branding: { ...config.branding, faviconUrl: null } })}
              >
                Remover imagem
              </Button>
            ) : null}
          </div>
        </div>
        {uploading ? <p className="text-xs text-muted-foreground">Enviando imagem…</p> : null}
      </section>


      <Separator />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Layout</h3>

        <SelectField
          label="Formato dos botões"
          value={config.layout.buttonShape}
          options={[
            ["rounded", "Arredondado"],
            ["square", "Reto"],
            ["pill", "Pílula"],
          ]}
          onChange={(value) => patch({ layout: { ...config.layout, buttonShape: value as ButtonShape } })}
        />
        <SelectField
          label="Sombra dos cards"
          value={config.layout.shadow}
          options={[
            ["none", "Sem sombra"],
            ["soft", "Suave"],
            ["medium", "Média"],
            ["strong", "Forte"],
          ]}
          onChange={(value) => patch({ layout: { ...config.layout, shadow: value as ShadowLevel } })}
        />
        <SelectField
          label="Estilo dos itens"
          value={config.layout.cardStyle}
          options={[
            ["list", "Lista"],
            ["grid", "Grade"],
            ["compact", "Compacto"],
          ]}
          onChange={(value) => patch({ layout: { ...config.layout, cardStyle: value as CardStyle } })}
        />
        <SelectField
          label="Posição da imagem"
          value={config.layout.imagePosition}
          options={[
            ["left", "À esquerda"],
            ["top", "Acima"],
            ["right", "À direita"],
          ]}
          onChange={(value) => patch({ layout: { ...config.layout, imagePosition: value as ImagePosition } })}
        />
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">O que mostrar</h3>
        {(
          [
            ["showPromoPrices", "Preços promocionais riscados"],
            ["showRatings", "Avaliações dos clientes"],
            ["showPhone", "Telefone e WhatsApp"],
            ["showAddress", "Endereço da loja"],
            ["showHours", "Horários de funcionamento"],
            ["showRepeatOrder", "Botão de repetir pedido"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <Label htmlFor={`display-${key}`} className="text-xs font-normal">
              {label}
            </Label>
            <Switch
              id={`display-${key}`}
              checked={config.display[key]}
              onCheckedChange={(checked) => patch({ display: { ...config.display, [key]: checked } })}
            />
          </div>
        ))}
      </section>

    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={isValidHex(value) ? value : "#000000"}
          onChange={(event) => onChange(event.target.value)}
          className="size-9 cursor-pointer rounded border border-border bg-transparent p-0"
          aria-label={label}
        />
        <Input value={value} onChange={(event) => onChange(event.target.value)} className="font-mono text-xs" />
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([key, optionLabel]) => (
            <SelectItem key={key} value={key}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
