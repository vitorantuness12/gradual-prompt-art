import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadDigitalDelivery, getDigitalDelivery } from "@/lib/digitais.functions";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/entrega/$token")({
  component: DeliveryPage,
  head: () => ({
    meta: [
      { title: "Sua entrega digital | O Seu Pedido" },
      { name: "description", content: "Acesse o arquivo do produto digital que você comprou, com link protegido e validade." },
      { property: "og:title", content: "Sua entrega digital | O Seu Pedido" },
      { property: "og:description", content: "Link protegido para baixar o produto digital comprado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function DeliveryPage() {
  const { token } = Route.useParams();
  const load = useServerFn(getDigitalDelivery);
  const consume = useServerFn(downloadDigitalDelivery);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  const query = useQuery({
    queryKey: ["digital-delivery", token],
    queryFn: () => load({ data: { token } }),
  });

  async function handleDownload() {
    setBusy(true);
    try {
      const result = await consume({ data: { token } });
      if (!result.ok || !result.url) {
        toast.error(result.message || "Não foi possível liberar o arquivo.");
        void query.refetch();
        return;
      }
      setRemaining(result.remaining);
      window.open(result.url, "_blank", "noopener");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha no download.");
    } finally {
      setBusy(false);
    }
  }

  const delivery = query.data;
  const left = remaining ?? delivery?.remaining ?? 0;

  return (
    <main className="min-h-screen bg-secondary/30 px-4 py-10">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <Logo />
        {query.isLoading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : (
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">{delivery?.productName || "Entrega digital"}</CardTitle>
              <CardDescription>
                {delivery?.storeName ? `Compra realizada em ${delivery.storeName}.` : "Link de entrega protegido."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {delivery?.ok ? (
                <>
                  <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-card p-3 text-muted-foreground">
                    <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                    <span>
                      {delivery.maxDownloads > 0 ? `${left} download(s) restantes.` : "Downloads liberados."}{" "}
                      {delivery.expiresAt ? `Válido até ${formatDateTime(delivery.expiresAt)}.` : ""}
                    </span>
                  </div>
                  {delivery.instructions ? (
                    <p className="whitespace-pre-wrap text-muted-foreground">{delivery.instructions}</p>
                  ) : null}
                  <Button className="w-full" onClick={() => void handleDownload()} disabled={busy}>
                    <Download className="mr-2 size-4" aria-hidden="true" />
                    {busy ? "Liberando..." : "Baixar agora"}
                  </Button>
                </>
              ) : (
                <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-destructive">
                  <Lock className="mt-0.5 size-4" aria-hidden="true" />
                  <span>{delivery?.message ?? "Link indisponível."}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
