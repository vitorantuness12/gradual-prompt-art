import { supabase } from "@/integrations/supabase/client";

/** Endereços reservados pela plataforma (espelham a lista validada no banco). */
export const RESERVED_SLUGS = new Set([
  "auth",
  "painel",
  "admin",
  "onboarding",
  "acompanhar",
  "loja",
  "api",
  "app",
  "assets",
  "static",
  "termos",
  "privacidade",
  "cookies",
  "entregador",
  "redefinir-senha",
  "sobre",
  "precos",
  "planos",
  "blog",
  "contato",
  "suporte",
  "ajuda",
  "login",
  "cadastro",
  "conta",
  "sistema",
  "public",
  "www",
]);

export const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{1,28})[a-z0-9]$/;

/** Converte um texto livre em slug válido: minúsculas, sem acento, sem espaço. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

export type SlugProblem = "empty" | "short" | "format" | "reserved" | null;

/** Validação local, executada antes de consultar o banco. */
export function validateSlugFormat(slug: string): SlugProblem {
  if (!slug) return "empty";
  if (slug.length < 3) return "short";
  if (!SLUG_PATTERN.test(slug)) return "format";
  if (RESERVED_SLUGS.has(slug)) return "reserved";
  return null;
}

export const SLUG_PROBLEM_MESSAGE: Record<Exclude<SlugProblem, null>, string> = {
  empty: "Informe o endereço da sua loja.",
  short: "Use pelo menos 3 caracteres.",
  format: "Use apenas letras minúsculas, números e hífen (sem começar ou terminar com hífen).",
  reserved: "Este endereço é reservado pela plataforma. Escolha outro.",
};

/**
 * Consulta a disponibilidade do slug no banco.
 * `storeId` permite que a própria loja mantenha o endereço atual durante uma edição.
 */
export async function checkSlugAvailability(slug: string, storeId?: string | null): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_slug_available", {
    _slug: slug,
    ...(storeId ? { _store_id: storeId } : {}),
  });

  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** Gera uma sugestão livre a partir do nome do negócio. */
export async function suggestSlug(name: string): Promise<string> {
  const base = slugify(name) || "minha-loja";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    try {
      if (await checkSlugAvailability(candidate)) return candidate;
    } catch {
      return base;
    }
  }
  return `${base}-${Math.floor(Math.random() * 900 + 100)}`;
}
