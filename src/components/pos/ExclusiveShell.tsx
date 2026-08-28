import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CircleHelp, Maximize, Minimize, Moon, Sun, Wifi, WifiOff, X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Moldura do modo de tela exclusiva usada pelo PDV e pelo KDS.
 *
 * Ocupa toda a área visível, não renderiza menu lateral, breadcrumb nem
 * cabeçalho administrativo, e mantém no topo direito o botão grande de saída.
 */

interface ExclusiveShellProps {
  storeName: string;
  storeLogoUrl?: string | null | undefined;
  /** Rótulo curto do módulo: "PDV", "KDS"... */
  moduleLabel: string;
  operatorName: string;
  terminal?: string | null | undefined;
  station?: string | null | undefined;
  online: boolean;
  clock?: string | undefined;
  cashStatus?: { open: boolean; label: string } | null | undefined;
  isFullscreen: boolean;
  fullscreenSupported: boolean;
  onToggleFullscreen: () => void;
  onExit: () => void;
  onHelp?: (() => void) | undefined;
  theme?: "light" | "dark" | undefined;
  onToggleTheme?: (() => void) | undefined;
  toolbar?: ReactNode | undefined;
  children: ReactNode;
}

export function ExclusiveShell({
  storeName,
  storeLogoUrl,
  moduleLabel,
  operatorName,
  terminal,
  station,
  online,
  clock,
  cashStatus,
  isFullscreen,
  fullscreenSupported,
  onToggleFullscreen,
  onExit,
  onHelp,
  theme,
  onToggleTheme,
  toolbar,
  children,
}: ExclusiveShellProps) {
  return (
    <TooltipProvider delayDuration={200}>
    {/* z-40: diálogos e menus do Radix usam z-50 e precisam ficar acima da moldura. */}
    <div className="fixed inset-0 z-40 flex h-dvh w-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          {storeLogoUrl ? (
            <img
              src={storeLogoUrl}
              alt=""
              className="size-9 shrink-0 rounded-lg object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm leading-tight font-semibold">{storeName}</p>
            <p className="text-[11px] leading-tight font-medium tracking-wide text-muted-foreground uppercase">
              {moduleLabel}
              {station ? ` · ${station}` : ""}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {cashStatus ? (
            <Badge
              variant="outline"
              className={cn(
                "gap-1.5 font-medium",
                cashStatus.open
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300",
              )}
            >
              <span
                className={cn("size-2 rounded-full", cashStatus.open ? "bg-emerald-500" : "bg-amber-500")}
                aria-hidden="true"
              />
              {cashStatus.label}
            </Badge>
          ) : null}
          {terminal ? (
            <Badge variant="secondary" className="font-medium">
              {terminal}
            </Badge>
          ) : null}
          <Badge variant="secondary" className="max-w-40 truncate font-medium">
            {operatorName}
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              "gap-1.5",
              online ? "border-border text-muted-foreground" : "border-destructive/50 bg-destructive/10 text-destructive",
            )}
          >
            {online ? <Wifi className="size-3.5" aria-hidden="true" /> : <WifiOff className="size-3.5" aria-hidden="true" />}
            {online ? "Conectado" : "Sem conexão"}
          </Badge>
          {clock ? <span className="text-sm font-semibold tabular-nums">{clock}</span> : null}
        </div>

        <div className="flex items-center gap-1.5">
          {toolbar}
          {onToggleTheme ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  onClick={onToggleTheme}
                  aria-label={theme === "dark" ? "Usar fundo claro" : "Usar fundo escuro"}
                >
                  {theme === "dark" ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{theme === "dark" ? "Fundo claro" : "Fundo escuro"}</TooltipContent>
            </Tooltip>
          ) : null}
          {onHelp ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-11" onClick={onHelp} aria-label="Ajuda">
                  <CircleHelp className="size-5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ajuda e atalhos</TooltipContent>
            </Tooltip>
          ) : null}
          {fullscreenSupported ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  onClick={onToggleFullscreen}
                  aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
                >
                  {isFullscreen ? <Minimize className="size-5" aria-hidden="true" /> : <Maximize className="size-5" aria-hidden="true" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isFullscreen ? "Sair da tela cheia" : "Tela cheia"}</TooltipContent>
            </Tooltip>
          ) : null}
          <Button
            variant="destructive"
            size="lg"
            className="h-11 gap-2 px-4 text-base font-semibold"
            onClick={onExit}
            aria-label={`Sair do ${moduleLabel}`}
          >
            <X className="size-6" aria-hidden="true" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
    </TooltipProvider>
  );
}

interface ExitConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

/** Confirmação de saída — nunca finaliza nem apaga nada, apenas navega. */
export function ExitConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Sair mesmo assim", onConfirm }: ExitConfirmProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continuar aqui</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
