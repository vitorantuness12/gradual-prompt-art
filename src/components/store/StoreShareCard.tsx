import { Copy, Download, ExternalLink } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { storePublicUrl } from "@/lib/store-url";

export interface StoreShareCardProps {
  slug: string;
  storeName?: string;
  /** Quando informado, avisa que o link só abre para clientes com a loja publicada. */
  isPublished?: boolean;
}

/** Link público e QR Code da loja, sempre no endereço canônico. */
export function StoreShareCard({ slug, storeName, isPublished }: StoreShareCardProps) {
  const url = storePublicUrl(slug);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, { width: 512, margin: 1, errorCorrectionLevel: "M" })
      .then((dataUrl) => {
        if (active) setQr(dataUrl);
      })
      .catch(() => setQr(null));
    return () => {
      active = false;
    };
  }, [url]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  async function share() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: storeName ?? "Minha loja", url });
        return;
      } catch {
        /* usuário cancelou o compartilhamento */
      }
    }
    void copyLink();
  }

  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle className="text-base">Link e QR Code da loja</CardTitle>
        <CardDescription>
          Divulgue este endereço nas redes, no balcão e nas embalagens. O QR Code é gerado a partir do endereço atual e
          se atualiza sozinho sempre que você altera o link ou republica a loja.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex size-32 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background p-2">
          {qr ? (
            <img src={qr} alt={`QR Code para ${url}`} className="size-full" />
          ) : (
            <span className="text-xs text-muted-foreground">Gerando...</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="break-all rounded-lg bg-muted px-3 py-2 text-sm font-medium">{url}</p>
          {isPublished === false ? (
            <p className="text-xs text-muted-foreground">
              A loja está despublicada: o QR Code já aponta para o endereço certo, mas os clientes só verão o catálogo
              após a publicação.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void copyLink()}>
              <Copy className="mr-2 size-4" aria-hidden="true" />
              Copiar link
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void share()}>
              <ExternalLink className="mr-2 size-4" aria-hidden="true" />
              Compartilhar
            </Button>
            {qr ? (
              <Button asChild type="button" size="sm" variant="ghost">
                <a href={qr} download={`qrcode-${slug}.png`}>
                  <Download className="mr-2 size-4" aria-hidden="true" />
                  Baixar QR Code
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
