import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface SmartUpsellSettingsProps {
  upsellMax: number;
  aiNotes: string;
  aiAvailable: boolean;
  generating: boolean;
  onChangeMax: (value: number) => void;
  onChangeNotes: (value: string) => void;
  onGenerate: () => void;
}

/**
 * Ajustes das sugestões de "leve também".
 * Só é exibido quando o lojista liga essa parte do catálogo inteligente.
 */
export function SmartUpsellSettings({
  upsellMax,
  aiNotes,
  aiAvailable,
  generating,
  onChangeMax,
  onChangeNotes,
  onGenerate,
}: SmartUpsellSettingsProps) {
  return (
    <div className="space-y-4 rounded-xl border border-border/70 bg-muted/30 p-4">
      <div className="space-y-2">
        <Label htmlFor="upsell-max">Máximo de sugestões por item</Label>
        <Select value={String(upsellMax)} onValueChange={(value) => onChangeMax(Number(value))}>
          <SelectTrigger id="upsell-max">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5, 6, 8].map((value) => (
              <SelectItem key={value} value={String(value)}>
                {value} {value === 1 ? "sugestão" : "sugestões"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ai-notes">Dicas para a inteligência artificial (opcional)</Label>
        <Textarea
          id="ai-notes"
          value={aiNotes}
          maxLength={600}
          placeholder="Ex.: sempre sugerir bebida com prato principal e sobremesa no fim."
          onChange={(event) => onChangeNotes(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Button variant="outline" onClick={onGenerate} disabled={generating || !aiAvailable}>
          <Sparkles className="mr-2 size-4" aria-hidden="true" />
          {generating ? "Montando combinações..." : "Gerar combinações com IA"}
        </Button>
        {!aiAvailable ? (
          <p className="text-sm text-destructive">
            A inteligência artificial ainda não está configurada nesta conta.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Salve as preferências antes de gerar, para a IA usar as suas dicas.
          </p>
        )}
      </div>
    </div>
  );
}
