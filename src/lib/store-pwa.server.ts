import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export interface StorePwaBranding {
  id: string;
  name: string;
  primary: string | null;
  icon: string | null;
  maskableIcon: string | null;
  hasDedicatedIcon: boolean;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Resolve somente a identidade publicada de uma loja ativa. */
export async function getStorePwaBranding(slug: string): Promise<StorePwaBranding | null> {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!supabaseUrl || !publishableKey) return null;

  const client = createClient<Database>(supabaseUrl, publishableKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data } = await client
    .from("stores")
    .select("id, name, logo_url, store_themes(published_config)")
    .eq("slug", slug)
    .eq("is_active", true)
    .eq("is_published", true)
    .maybeSingle();
  if (!data) return null;

  const relation = Array.isArray(data.store_themes) ? data.store_themes[0] : data.store_themes;
  const published = relation?.published_config;
  const config =
    published && typeof published === "object" && !Array.isArray(published)
      ? (published as Record<string, unknown>)
      : {};
  const brandingValue = config["branding"];
  const colorsValue = config["colors"];
  const branding =
    brandingValue && typeof brandingValue === "object" && !Array.isArray(brandingValue)
      ? (brandingValue as Record<string, unknown>)
      : {};
  const colors =
    colorsValue && typeof colorsValue === "object" && !Array.isArray(colorsValue)
      ? (colorsValue as Record<string, unknown>)
      : {};
  const pwaIcon = nonEmptyString(branding["pwaIconUrl"]);
  const storeLogo = nonEmptyString(branding["logoUrl"]) ?? nonEmptyString(data.logo_url);

  return {
    id: data.id,
    name: nonEmptyString(branding["pwaName"]) ?? data.name,
    primary: nonEmptyString(colors["primary"]),
    icon: pwaIcon ?? storeLogo,
    maskableIcon: nonEmptyString(branding["pwaMaskableIconUrl"]),
    hasDedicatedIcon: pwaIcon !== null,
  };
}