import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Mail, MessageCircle, Smartphone } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { PushNotificationsCard } from "@/components/painel/PushNotificationsCard";

/**
 * Central de notificações internas da loja.
 * O push no celular funciona pelo worker de mensagens; e-mail e WhatsApp
 * dependem das integrações configuradas em Canais.
 */
const CHANNELS = [
  { key: "email", label: "E-mail", icon: Mail },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "push", label: "Push", icon: Smartphone },
] as const;

export function NotificationCenter({ storeId }: { storeId: string | undefined }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["notifications", storeId],
    enabled: Boolean(storeId),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("notifications")
        .select("id, title, body, event, created_at, read_at")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw new Error(error.message);
      return rows ?? [];
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("store_id", storeId!)
        .is("read_at", null);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", storeId] }),
  });

  const notifications = data ?? [];
  const unread = notifications.filter((item) => !item.read_at).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label="Notificações da loja">
          <Bell className="size-4" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-medium text-foreground">Notificações</p>
          {unread > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => markAllRead.mutate()}>
              Marcar lidas
            </Button>
          ) : null}
        </div>

        <ScrollArea className="max-h-72">
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma notificação por aqui ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((item) => (
                <li key={item.id} className="px-3 py-2">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  {item.body ? <p className="text-xs text-muted-foreground">{item.body}</p> : null}
                  <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(item.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <div className="border-t border-border px-3 py-3">
          <PushNotificationsCard storeId={storeId} compact />
        </div>

        <div className="border-t border-border px-3 py-2">
          <p className="text-xs font-medium text-foreground">Outros canais</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CHANNELS.map((channel) => (
              <Badge key={channel.key} variant="secondary" className="gap-1 text-[11px]">
                <channel.icon className="size-3" />
                {channel.label}
              </Badge>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
