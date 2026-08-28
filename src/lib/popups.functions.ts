import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

/**
 * Preferências e eventos das janelas de entrada.
 *
 * O cliente da loja não tem conta, então a preferência "não mostrar
 * novamente" e os eventos (abertura, clique, conversão) são gravados pelo
 * servidor com o cliente admin, identificados por uma chave aleatória do
 * navegador e limitados por IP para impedir abuso. Nenhum dado pessoal é
 * armazenado — nem telefone, nem nome.
 */
const kindSchema = z.enum(["repeat", "highlights"]);

const browserKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(64)
  .regex(/^[a-zA-Z0-9-]+$/);

const slugSchema = z.string().trim().min(2).max(60);

async function resolveStoreId(slug: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("stores")
    .select("id")
    .eq("slug", slug.toLowerCase())
    .eq("is_active", true)
    .maybeSingle();
  return data?.id ?? null;
}

export const getPopupPreference = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ slug: slugSchema, kind: kindSchema, browserKey: browserKeySchema }).parse(data),
  )
  .handler(async ({ data }) => {
    const { clientIdentifier, consumeRateLimit } = await import("@/lib/security.server");
    const limit = await consumeRateLimit("popup", clientIdentifier(getRequest()?.headers));
    if (!limit.allowed) return { dontShowAgain: false, dismissedVersion: 0 };

    const storeId = await resolveStoreId(data.slug);
    if (!storeId) return { dontShowAgain: false, dismissedVersion: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("customer_popup_preferences")
      .select("dont_show_again, dismissed_version")
      .eq("store_id", storeId)
      .eq("popup_kind", data.kind)
      .eq("browser_key", data.browserKey)
      .maybeSingle();

    return {
      dontShowAgain: Boolean(row?.dont_show_again),
      dismissedVersion: Number(row?.dismissed_version ?? 0),
    };
  });

export const savePopupPreference = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        slug: slugSchema,
        kind: kindSchema,
        browserKey: browserKeySchema,
        dontShowAgain: z.boolean(),
        dismissedVersion: z.number().int().min(0),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { clientIdentifier, consumeRateLimit } = await import("@/lib/security.server");
    const limit = await consumeRateLimit("popup", clientIdentifier(getRequest()?.headers));
    if (!limit.allowed) return { ok: false };

    const storeId = await resolveStoreId(data.slug);
    if (!storeId) return { ok: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("customer_popup_preferences").upsert(
      {
        store_id: storeId,
        popup_kind: data.kind,
        browser_key: data.browserKey,
        dont_show_again: data.dontShowAgain,
        dismissed_version: data.dismissedVersion,
        last_shown_at: new Date().toISOString(),
      },
      { onConflict: "store_id,popup_kind,browser_key" },
    );
    if (error) {
      console.error("Falha ao salvar preferência de janela", error.message);
      return { ok: false };
    }
    return { ok: true };
  });

const EVENTS = ["open", "close", "click", "add_to_cart", "repeat", "conversion", "dismiss_forever"] as const;

export const logPopupEvent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        slug: slugSchema,
        kind: kindSchema,
        event: z.enum(EVENTS),
        browserKey: browserKeySchema.nullish(),
        meta: z.record(z.string(), z.unknown()).nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { clientIdentifier, consumeRateLimit } = await import("@/lib/security.server");
    const limit = await consumeRateLimit("popup", clientIdentifier(getRequest()?.headers));
    if (!limit.allowed) return { ok: false };

    const storeId = await resolveStoreId(data.slug);
    if (!storeId) return { ok: false };

    // Nada de dados pessoais: o meta aceita apenas valores simples e curtos.
    const meta = Object.fromEntries(
      Object.entries(data.meta ?? {})
        .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
        .map(([key, value]) => [key.slice(0, 40), typeof value === "string" ? value.slice(0, 120) : value]),
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("customer_order_repeat_events").insert({
      store_id: storeId,
      popup_kind: data.kind,
      event: data.event,
      browser_key: data.browserKey ?? null,
      meta: meta as never,
    });
    if (error) {
      console.error("Falha ao registrar evento de janela", error.message);
      return { ok: false };
    }
    return { ok: true };
  });
