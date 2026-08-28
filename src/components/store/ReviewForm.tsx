import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { orderHasReview, submitReview } from "@/lib/avaliacoes";
import { cn } from "@/lib/utils";

interface ReviewFormProps {
  storeId: string;
  orderId: string;
  defaultName?: string;
}

/** Formulário de nota e comentário exibido após o pedido ser concluído. */
export function ReviewForm({ storeId, orderId, defaultName }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [name, setName] = useState(defaultName ?? "");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    void orderHasReview(orderId).then((exists) => {
      if (!active) return;
      setDone(exists);
      setChecked(true);
    });
    return () => {
      active = false;
    };
  }, [orderId]);

  if (!checked) return null;

  if (done) {
    return (
      <Card className="border-border/70">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Obrigado! Sua avaliação já foi registrada para este pedido.
        </CardContent>
      </Card>
    );
  }

  async function handleSubmit() {
    if (rating < 1) {
      toast.error("Escolha uma nota de 1 a 5 estrelas.");
      return;
    }
    setSending(true);
    try {
      await submitReview({ storeId, orderId, customerName: name, rating, comment });
      setDone(true);
      toast.success("Avaliação enviada. Obrigado pelo retorno!");
    } catch {
      toast.error("Não foi possível enviar sua avaliação agora.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Como foi sua experiência?</CardTitle>
        <CardDescription>Sua avaliação ajuda a loja a melhorar e orienta outros clientes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Nota de 1 a 5">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} ${value === 1 ? "estrela" : "estrelas"}`}
              onMouseEnter={() => setHover(value)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setRating(value)}
              className="rounded-md p-1 transition hover:scale-110"
            >
              <Star
                className={cn(
                  "size-7",
                  (hover || rating) >= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="review-name">Seu nome</Label>
          <Input
            id="review-name"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            placeholder="Como quer aparecer na avaliação"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="review-comment">Comentário (opcional)</Label>
          <Textarea
            id="review-comment"
            value={comment}
            maxLength={600}
            rows={3}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Conte como foi o atendimento, o produto e a entrega."
          />
        </div>

        <Button type="button" onClick={() => void handleSubmit()} disabled={sending}>
          {sending ? "Enviando..." : "Enviar avaliação"}
        </Button>
      </CardContent>
    </Card>
  );
}
