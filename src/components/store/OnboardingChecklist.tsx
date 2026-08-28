import { Check, Circle } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { ONBOARDING_STEPS, onboardingProgress, type OnboardingState } from "@/lib/store-config";
import { cn } from "@/lib/utils";

export interface OnboardingChecklistProps {
  state: OnboardingState;
  onStepClick?: (key: keyof OnboardingState) => void;
  className?: string;
}

/** Checklist de progresso do onboarding, retomável a qualquer momento. */
export function OnboardingChecklist({ state, onStepClick, className }: OnboardingChecklistProps) {
  const progress = onboardingProgress(state);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Progresso da configuração</span>
          <span className="text-muted-foreground">{progress}%</span>
        </div>
        <Progress value={progress} aria-label="Progresso do onboarding" />
      </div>

      <ul className="space-y-1">
        {ONBOARDING_STEPS.map((step) => {
          const done = Boolean(state[step.key]);
          const content = (
            <>
              {done ? (
                <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <span className={cn("text-sm", done ? "text-muted-foreground line-through" : "text-foreground")}>
                {step.label}
              </span>
            </>
          );

          return (
            <li key={step.key}>
              {onStepClick ? (
                <button
                  type="button"
                  onClick={() => onStepClick(step.key)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {content}
                </button>
              ) : (
                <div className="flex items-center gap-2 px-2 py-1.5">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
