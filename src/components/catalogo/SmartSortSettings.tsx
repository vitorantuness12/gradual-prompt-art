import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AUTOSORT_SCOPES, AUTOSORT_WINDOWS, type AutosortScope } from "@/lib/catalogo-inteligente";

export interface SmartSortSettingsProps {
  autosortWindowDays: number;
  autosortScope: AutosortScope;
  onChangeWindow: (value: number) => void;
  onChangeScope: (value: AutosortScope) => void;
}

/**
 * Ajustes da vitrine organizada pelos itens que mais vendem.
 * Só aparece quando o lojista liga essa parte do catálogo inteligente.
 */
export function SmartSortSettings({
  autosortWindowDays,
  autosortScope,
  onChangeWindow,
  onChangeScope,
}: SmartSortSettingsProps) {
  return (
    <div className="grid gap-4 rounded-xl border border-border/70 bg-muted/30 p-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="autosort-window">Período de vendas analisado</Label>
        <Select
          value={String(autosortWindowDays)}
          onValueChange={(value) => onChangeWindow(Number(value))}
        >
          <SelectTrigger id="autosort-window">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUTOSORT_WINDOWS.map((option) => (
              <SelectItem key={option.value} value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="autosort-scope">Onde reorganizar</Label>
        <Select value={autosortScope} onValueChange={(value) => onChangeScope(value as AutosortScope)}>
          <SelectTrigger id="autosort-scope">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUTOSORT_SCOPES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
