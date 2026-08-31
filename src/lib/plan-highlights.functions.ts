import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Gera, com IA, uma lista curta de destaques (benefícios) para o cartão de
 * preço de um plano, a partir dos limites, recursos e módulos já marcados
 * pelo super admin no formulário. Evita escrever o texto na mão toda vez.
 */

const inputSchema = z.object({
  name: z.string().trim().max(80).default(""),
  tagline: z.string().trim().max(200).default(""),
  priceMonth: z.string().trim().max(20).default("0"),
  limits: z.record(z.string(), z.string()).default({}),
  features: z.record(z.string(), z.string()).default({}),
  moduleLabels: z.array(z.string().trim().max(80)).max(60).default([]),
});

const outputSchema = z.object({ highlights: z.array(z.string().trim().max(80)).max(6) });

const SYSTEM_PROMPT = [
  "Você escreve destaques curtos para cartões de preço de planos de um SaaS brasileiro de lojas online.",
  "Receba os limites, recursos e módulos liberados do plano e devolva de 4 a 6 frases curtas (até 60 caracteres cada),",
  "em português, começando pelo benefício (não repita 'inclui' toda hora), sem emoji, sem ponto final.",
  "Priorize o que é mais atrativo para o lojista: limites generosos, recursos exclusivos e módulos liberados.",
  "Ignore itens com valor zero ou não incluso. Devolva SOMENTE um JSON no formato {\"highlights\":[...]} sem markdown.",
].join(" ");

function parseHighlights(raw: string): string[] {
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
  const shape = outputSchema.safeParse(parsed);
  return shape.success ? shape.data.highlights.filter(Boolean) : [];
}

export const generatePlanHighlights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; highlights: string[]; message: string }> => {
    const { data: role } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!role) return { ok: false, highlights: [], message: "Sem permissão para gerar destaques." };

    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      return { ok: false, highlights: [], message: "A geração com IA não está disponível no momento." };
    }

    const limitsText = Object.entries(data.limits)
      .filter(([, value]) => value && value !== "0")
      .map(([key, value]) => `${key}: ${value === "-1" ? "ilimitado" : value}`)
      .join("; ");
    const featuresText = Object.entries(data.features)
      .filter(([, value]) => value && value !== "false")
      .map(([key, value]) => `${key}: ${value}`)
      .join("; ");
    const modulesText = data.moduleLabels.join(", ");

    const prompt = [
      `Plano: ${data.name || "Sem nome"}`,
      data.tagline ? `Chamada: ${data.tagline}` : null,
      `Preço mensal: R$ ${data.priceMonth}`,
      limitsText ? `Limites incluídos: ${limitsText}` : null,
      featuresText ? `Recursos: ${featuresText}` : null,
      modulesText ? `Módulos liberados no painel: ${modulesText}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.4,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (response.status === 401) {
        return { ok: false, highlights: [], message: "Chave da OpenAI inválida. Revise a configuração da IA." };
      }
      if (response.status === 429) {
        return { ok: false, highlights: [], message: "Limite de uso da IA atingido. Tente novamente em instantes." };
      }
      if (response.status === 402) {
        return { ok: false, highlights: [], message: "Créditos de IA esgotados. Recarregue para continuar usando." };
      }
      if (!response.ok) {
        return { ok: false, highlights: [], message: "Não consegui gerar os destaques agora. Tente de novo." };
      }

      const json = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const highlights = parseHighlights(json.choices?.[0]?.message?.content ?? "");
      if (highlights.length === 0) {
        return { ok: false, highlights: [], message: "A IA não retornou destaques válidos. Tente novamente." };
      }
      return { ok: true, highlights, message: `${highlights.length} destaques gerados.` };
    } catch {
      return { ok: false, highlights: [], message: "Falha ao contatar a IA. Tente novamente." };
    }
  });
