import { WifiOff } from "lucide-react";

import { useOnlineStatus } from "@/hooks/useExclusiveShell";

export function ConnectionBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[70] flex min-h-11 items-center justify-center gap-2 bg-warning px-4 py-2 text-center text-sm font-semibold text-warning-foreground"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      Sem conexão. Reconecte-se para continuar.
    </div>
  );
}