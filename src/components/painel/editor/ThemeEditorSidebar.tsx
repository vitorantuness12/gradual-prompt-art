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
import { maskPhone } from "@/lib/masks";
import {
  contrastWarnings,
  formatFooterPhone,
  isValidFooterPhone,
  isValidHex,
  paletteFromPrimary,
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
        <h3 className="text-sm font-semibold text-foreground">Cores</h3>
        <button
          type="button"
          className="text-xs font-medium text-primary underline underline-offset-2"
          onClick={() => patch({ colors: { ...paletteFromPrimary(config.colors.primary) } })}
        >
          Gerar paleta a partir da cor principal
        </button>
        <div className="grid gap-3 sm:grid-cols-2">
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

      <Separator />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Rodapé da loja</h3>
        <p className="text-xs text-muted-foreground">
          Deixe em branco para usar os dados cadastrados da loja. O telefone é formatado automaticamente.
        </p>
        <div className="space-y-1">
          <Label className="text-xs">Nome exibido</Label>
          <Input
            value={config.footer.name ?? ""}
            placeholder="Nome da loja"
            maxLength={80}
            onChange={(event) => setFooter({ name: event.target.value || null })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Telefone</Label>
          <Input
            value={config.footer.phone ?? ""}
            placeholder="(00) 00000-0000"
            inputMode="tel"
            maxLength={16}
            onChange={(event) => {
              const masked = maskPhone(event.target.value);
              setFooter({ phone: masked || null });
            }}
          />
          {!isValidFooterPhone(config.footer.phone) ? (
            <p className="text-xs text-destructive">Telefone incompleto. Digite DDD + número.</p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Endereço</Label>
          <Input
            value={config.footer.address ?? ""}
            placeholder="Rua, número — bairro, cidade/UF"
            maxLength={160}
            onChange={(event) => setFooter({ address: event.target.value || null })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Frase do rodapé</Label>
          <Input
            value={config.footer.note ?? ""}
            placeholder="Feito com O Seu Pedido"
            maxLength={120}
            onChange={(event) => setFooter({ note: event.target.value || null })}
          />
          {!config.footer.note?.trim() ? (
            <p className="text-xs text-muted-foreground">
              Se estiver em branco, exibiremos "Feito com O Seu Pedido".
            </p>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ColorField
            label="Cor de fundo"
            value={config.footer.background}
            onChange={(value) => setFooter({ background: value })}
          />
          <ColorField
            label="Cor do texto"
            value={config.footer.text}
            onChange={(value) => setFooter({ text: value })}
          />
        </div>
        <div
          className="rounded-lg border border-border p-3 text-center"
          style={{
            background: config.footer.background,
            color: config.footer.text,
          }}
        >
          <p className="text-sm font-semibold">{config.footer.name?.trim() || "Nome da loja"}</p>
          <p className="mt-1 text-xs opacity-90">
            {formatFooterPhone(config.footer.phone) || "(00) 00000-0000"}
          </p>
          <p className="mt-1 text-xs opacity-90">{config.footer.address?.trim() || "Endereço da loja"}</p>
          <p className="mt-2 text-[10px] opacity-80">
            {config.footer.note?.trim() || "Feito com O Seu Pedido"}
          </p>
        </div>
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
