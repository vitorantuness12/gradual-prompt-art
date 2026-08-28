import { cn } from "@/lib/utils";

export interface DemoBadgeProps {
  className?: string;
  /** Texto complementar exibido junto ao selo. */
  label?: string;
}

/**
 * Selo obrigatório para qualquer conteúdo de demonstração.
 * Deixa explícito que o dado não representa uma operação real.
 */
export function DemoBadge({ className, label = "Exemplo" }: DemoBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning",
        className,
      )}
      title="Conteúdo de demonstração, não representa dados reais"
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
      {label}
    </span>
  );
}
