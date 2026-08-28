import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PauseCircle, PlayCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { PAUSE_PRESETS, isPauseActive, pauseStatusLabel } from "@/lib/operacao";
import { setStoreOrderPause } from "@/lib/operacao.functions";
import { cn } from "@/lib/utils";

/**
 * Botão "estou lotado": pausa a entrada de novos pedidos por alguns minutos
 * e reabre sozinho quando o tempo acaba.
 */
export function StorePauseButton({ storeId, className }: { storeId: string | undefined; className?: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const pauseFn = useServerFn(setStoreOrderPause);

  const statusQuery = useQuery({
    queryKey: ["store-pause-status", storeId],
    enabled: Boolean(storeId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("availability_status, paused_until")
        .eq("id", storeId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const paused = isPauseActive(statusQuery.data?.availability_status, statusQuery.data?.paused_until);
  const label = pauseStatusLabel(statusQuery.data?.availability_status, statusQuery.data?.paused_until);

  const mutation = useMutation({
    mutationFn: (minutes: number) => pauseFn({ data: { storeId: storeId!, minutes } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["store-pause-status", storeId] });
      void queryClient.invalidateQueries({ queryKey: ["store"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!storeId) return null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={paused ? "destructive" : "outline"}
        className={cn("gap-2", className)}
        onClick={() => setOpen(true)}
      >
        {paused ? <PlayCircle className="size-4" aria-hidden="true" /> : <PauseCircle className="size-4" aria-hidden="true" />}
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">{paused ? "Pausado" : "Pausar"}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{paused ? "Pedidos pausados" : "Pausar pedidos por demanda"}</DialogTitle>
            <DialogDescription>
              {paused
                ? label
                : "Use quando a cozinha estiver lotada. A loja para de receber pedidos e volta sozinha no fim do tempo."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            {PAUSE_PRESETS.map((preset) => (
              <Button
                key={preset.minutes}
                type="button"
                variant="outline"
                className="h-12"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(preset.minutes)}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Fechar
            </Button>
            <Button type="button" disabled={!paused || mutation.isPending} onClick={() => mutation.mutate(0)}>
              <PlayCircle className="mr-2 size-4" aria-hidden="true" />
              Voltar a receber pedidos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
