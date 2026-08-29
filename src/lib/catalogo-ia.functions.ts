import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { catalogPreset } from "@/lib/catalogo-segmento";

/**
 * Extração de catálogo com IA: converte fotos (cardápio, tabela de preços,
 * prateleira) ou texto colado em uma lista estruturada de itens para revisão.
 */

const extractInput = z.object({
  storeId: z.string().uuid(),
  // Imagens em data URL (base64) — no máximo 4 por chamada.
  images: z.array(z.string().max(8_000_000)).max(4).default([]),
  text: z.string().trim().max(20_000).default(""),
  segment: z
    .enum(["alimentacao", "varejo", "conveniencia", "servicos", "digital", "encomendas"])
    .default("alimentacao"),
});

export interface AiCatalogItem {
  name: string;
  description: string | null;
  categoryName: string | null;
  kind: "product" | "service" | "preorder" | "subscription" | "digital" | "combo";
  price: number;
  promoPrice: number | null;
  unit: string;
  durationMinutes: number | null;
  tags: string[];
}

const itemSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(400).nullish(),
  categoryName: z.string().trim().max(80).nullish(),
  kind: z.enum(["product", "service", "preorder", "subscription", "digital", "combo"]).default("product"),
  price: z.coerce.number().min(0).default(0),
  promoPrice: z.coerce.number().min(0).nullish(),
  unit: z.string().trim().max(20).default("un"),
  durationMinutes: z.coerce.number().min(0).max(1440).nullish(),
  tags: z.array(z.string().trim().max(30)).max(8).default([]),
});

const SYSTEM_PROMPT = [
  "Você extrai catálogos de lojas brasileiras a partir de imagens ou textos.",
  "Devolva SOMENTE um JSON no formato {\"items\":[...]} sem comentários e sem markdown.",
  "Cada item: name, description, categoryName, kind, price, promoPrice, unit, durationMinutes, tags.",
  "kind deve ser um de: product, service, preorder, subscription, digital, combo.",
  "Preços em número decimal com ponto (54.90). Se não houver preço, use 0.",
  "promoPrice só quando houver preço promocional explícito, senão null.",
  "categoryName é a seção do cardápio/lista (ex.: Pizzas, Bebidas); null se não houver.",
  "Nunca invente itens que não aparecem na fonte. Máximo de 80 itens.",
].join(" ");

function parseItems(raw: string): AiCatalogItem[] {
  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }
  const shape = z.object({ items: z.array(z.unknown()).default([]) }).safeParse(parsed);
  if (!shape.success) return [];
  const items: AiCatalogItem[] = [];
  for (const entry of shape.data.items) {
    const result = itemSchema.safeParse(entry);
    if (!result.success) continue;
    const value = result.data;
    items.push({
      name: value.name,
      description: value.description?.trim() || null,
      categoryName: value.categoryName?.trim() || null,
      kind: value.kind,
      price: Number(value.price.toFixed(2)),
      promoPrice: value.promoPrice != null && value.promoPrice > 0 ? Number(value.promoPrice.toFixed(2)) : null,
      unit: value.unit || "un",
      durationMinutes:
        value.durationMinutes != null && value.durationMinutes > 0 ? Math.round(value.durationMinutes) : null,
      tags: value.tags.filter(Boolean),
    });
  }
  return items.slice(0, 80);
}

export const extractCatalogWithAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => extractInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; items: AiCatalogItem[]; message: string }> => {
    const { data: allowed } = await context.supabase.rpc("is_store_staff", {
      _store_id: data.storeId,
      _user_id: context.userId,
    });
    if (allowed !== true) return { ok: false, items: [], message: "Sem permissão para esta loja." };

    if (data.images.length === 0 && data.text.trim().length < 4) {
      return { ok: false, items: [], message: "Envie ao menos uma foto ou cole o texto do cardápio." };
    }

    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      return { ok: false, items: [], message: "A leitura com IA não está disponível no momento." };
    }

    const content: Record<string, unknown>[] = [];
    if (data.text.trim()) {
      content.push({ type: "text", text: `Extraia o catálogo deste texto:\n\n${data.text.trim()}` });
    }
    if (data.images.length > 0) {
      content.push({ type: "text", text: "Extraia o catálogo destas imagens." });
      for (const image of data.images) {
        content.push({ type: "image_url", image_url: { url: image } });
      }
    }

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0,
          messages: [
            { role: "system", content: `${SYSTEM_PROMPT} ${catalogPreset(data.segment).aiInstructions}` },
            { role: "user", content },
          ],
        }),
      });

      if (response.status === 401) {
        return { ok: false, items: [], message: "Chave da OpenAI inválida. Revise a configuração da IA." };
      }
      if (response.status === 429) {
        return {
          ok: false,
          items: [],
          message: "Limite de uso da IA atingido. Aguarde instantes ou verifique os créditos da sua conta OpenAI.",
        };
      }
      if (response.status === 402) {
        return { ok: false, items: [], message: "Créditos de IA esgotados. Recarregue para continuar usando." };
      }
      if (!response.ok) {
        return { ok: false, items: [], message: "Não consegui ler o material agora. Tente de novo." };
      }

      const json = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const items = parseItems(json.choices?.[0]?.message?.content ?? "");
      if (items.length === 0) {
        return { ok: false, items: [], message: "Não encontrei itens legíveis. Tente uma foto mais nítida." };
      }
      return { ok: true, items, message: `${items.length} itens identificados.` };
    } catch {
      return { ok: false, items: [], message: "Falha ao contatar a IA. Tente novamente." };
    }
  });
