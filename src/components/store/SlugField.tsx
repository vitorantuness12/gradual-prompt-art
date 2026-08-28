import { Check, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  SLUG_PROBLEM_MESSAGE,
  checkSlugAvailability,
  slugify,
  validateSlugFormat,
} from "@/lib/slug";
import { PUBLIC_STORE_DOMAIN } from "@/lib/store-url";

export type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export interface SlugFieldProps {
  value: string;
  onChange: (value: string) => void;
  onStatusChange?: (status: SlugStatus) => void;
  /** Loja em edição: permite manter o endereço atual. */
  storeId?: string | null;
  label?: string;
  description?: string;
  id?: string;
}

/** Campo de endereço público com validação de formato e disponibilidade em tempo real. */
export function SlugField({
  value,
  onChange,
  onStatusChange,
  storeId,
  label = "Endereço da sua loja",
  description = "Este é o link que você divulga aos clientes.",
  id = "slug",
}: SlugFieldProps) {
  const [status, setStatus] = useState<SlugStatus>("idle");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const problem = validateSlugFormat(value);
    if (problem) {
      setStatus("invalid");
      setMessage(SLUG_PROBLEM_MESSAGE[problem]);
      onStatusChange?.("invalid");
      return;
    }

    setStatus("checking");
    setMessage("Verificando disponibilidade...");
    onStatusChange?.("checking");

    const timer = window.setTimeout(async () => {
      try {
        const available = await checkSlugAvailability(value, storeId ?? null);
        setStatus(available ? "available" : "taken");
        setMessage(available ? "Endereço disponível!" : "Este endereço já está em uso. Escolha outro.");
        onStatusChange?.(available ? "available" : "taken");
      } catch {
        setStatus("invalid");
        setMessage("Não foi possível verificar agora. Tente novamente.");
        onStatusChange?.("invalid");
      }
    }, 450);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, storeId]);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-0 overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
        <span className="shrink-0 border-r border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
          {PUBLIC_STORE_DOMAIN}/
        </span>
        <Input
          id={id}
          value={value}
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(event) => onChange(slugify(event.target.value))}
          className="border-0 focus-visible:ring-0"
          placeholder="nomedaloja"
          aria-describedby={`${id}-status`}
        />
        <span className="px-3" aria-hidden="true">
          {status === "checking" ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          {status === "available" ? <Check className="size-4 text-success" /> : null}
          {status === "taken" || status === "invalid" ? <X className="size-4 text-destructive" /> : null}
        </span>
      </div>
      <p
        id={`${id}-status`}
        aria-live="polite"
        className={cn(
          "text-xs",
          status === "available" ? "text-success" : status === "checking" ? "text-muted-foreground" : "text-destructive",
        )}
      >
        {message}
      </p>
      <p className="text-xs text-muted-foreground">
        {description} Seu link ficará assim: <strong className="text-foreground">https://{PUBLIC_STORE_DOMAIN}/{value || "nomedaloja"}</strong>
      </p>
    </div>
  );
}
