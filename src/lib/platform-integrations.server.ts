/**
 * Regras de servidor das integrações globais da plataforma.
 * Segredos ficam apenas aqui: o painel recebe somente indicadores mascarados.
 */
import { providerFields } from "@/lib/platform-integrations";

export interface PlatformIntegrationView {
  kind: string;
  provider: string;
  label: string;
  isEnabled: boolean;
  status: string;
  hasSecret: boolean;
  /** Valores públicos + segredos mascarados (nunca o valor real). */
  values: Record<string, string>;
  missing: string[];
  updatedAt: string | null;
  storesUsing: number;
}

const SECRET_BOX = "__secrets";

export function maskValue(value: string): string {
  const raw = value.trim();
  if (raw.length <= 4) return "••••";
  return `••••${raw.slice(-4)}`;
}

interface StoredConfig {
  [key: string]: unknown;
  __secrets?: Record<string, string>;
}

export function toView(
  row: {
    kind: string;
    provider: string;
    label: string;
    is_enabled: boolean;
    status: string;
    has_secret: boolean;
    config: unknown;
    updated_at: string | null;
  },
  storesUsing: number,
): PlatformIntegrationView {
  const config = (row.config ?? {}) as StoredConfig;
  const secrets = (config[SECRET_BOX] as Record<string, string> | undefined) ?? {};
  const values: Record<string, string> = {};
  const missing: string[] = [];

  for (const field of providerFields(row.provider)) {
    const raw = field.secret ? secrets[field.key] : (config[field.key] as string | undefined);
    if (raw) values[field.key] = field.secret ? maskValue(raw) : raw;
    else if (field.required) missing.push(field.label);
  }

  return {
    kind: row.kind,
    provider: row.provider,
    label: row.label,
    isEnabled: row.is_enabled,
    status: row.status,
    hasSecret: row.has_secret,
    values,
    missing,
    updatedAt: row.updated_at,
    storesUsing,
  };
}

/** Mescla o formulário com o que já está salvo (campo vazio preserva o valor). */
export function mergeConfig(
  provider: string,
  existing: unknown,
  input: Record<string, string>,
): { config: StoredConfig; hasSecret: boolean; missing: string[] } {
  const current = ((existing ?? {}) as StoredConfig) || {};
  const secrets: Record<string, string> = { ...((current[SECRET_BOX] as Record<string, string>) ?? {}) };
  const next: StoredConfig = { ...current };
  delete next[SECRET_BOX];

  for (const field of providerFields(provider)) {
    const value = (input[field.key] ?? "").trim();
    if (field.secret) {
      if (value) secrets[field.key] = value;
    } else if (field.key in input) {
      if (value) next[field.key] = value;
      else delete next[field.key];
    }
  }

  const missing = providerFields(provider)
    .filter((field) => field.required && !(field.secret ? secrets[field.key] : next[field.key]))
    .map((field) => field.label);

  next[SECRET_BOX] = secrets;
  return { config: next, hasSecret: Object.keys(secrets).length > 0, missing };
}

export function readSecrets(config: unknown): Record<string, string> {
  return (((config ?? {}) as StoredConfig)[SECRET_BOX] as Record<string, string> | undefined) ?? {};
}

async function ping(url: string, headers: Record<string, string>): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(url, { headers });
    if (response.ok) return { ok: true, message: "Credenciais válidas." };
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: "Credencial recusada pelo provedor (401/403)." };
    }
    return { ok: false, message: `O provedor respondeu ${response.status}.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Falha de conexão." };
  }
}

/** Testa de verdade quando o provedor tem endpoint público; senão valida os campos. */
export async function testProvider(
  provider: string,
  config: unknown,
): Promise<{ ok: boolean; message: string; live: boolean }> {
  const secrets = readSecrets(config);
  const plain = (config ?? {}) as Record<string, unknown>;

  switch (provider) {
    case "stripe": {
      const key = secrets["secret_key"];
      if (!key) return { ok: false, message: "Informe a secret key.", live: false };
      const result = await ping("https://api.stripe.com/v1/balance", { Authorization: `Bearer ${key}` });
      return { ...result, live: true };
    }
    case "mercadopago": {
      const token = secrets["access_token"];
      if (!token) return { ok: false, message: "Informe o access token.", live: false };
      const result = await ping("https://api.mercadopago.com/users/me", { Authorization: `Bearer ${token}` });
      return { ...result, live: true };
    }
    case "resend": {
      const key = secrets["api_key"];
      if (!key) return { ok: false, message: "Informe a API key.", live: false };
      const result = await ping("https://api.resend.com/domains", { Authorization: `Bearer ${key}` });
      return { ...result, live: true };
    }
    case "sendgrid": {
      const key = secrets["api_key"];
      if (!key) return { ok: false, message: "Informe a API key.", live: false };
      const result = await ping("https://api.sendgrid.com/v3/scopes", { Authorization: `Bearer ${key}` });
      return { ...result, live: true };
    }
    case "google_maps": {
      const key = secrets["api_key"];
      if (!key) return { ok: false, message: "Informe a API key.", live: false };
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=Brasilia&key=${encodeURIComponent(key)}`,
        );
        const body = (await response.json()) as { status?: string; error_message?: string };
        if (body.status === "OK" || body.status === "ZERO_RESULTS") {
          return { ok: true, message: "Chave válida.", live: true };
        }
        return { ok: false, message: body.error_message ?? `Retorno: ${body.status}`, live: true };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Falha de conexão.", live: true };
      }
    }
    case "mapbox": {
      const token = secrets["access_token"];
      if (!token) return { ok: false, message: "Informe o access token.", live: false };
      const result = await ping(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/brasilia.json?access_token=${encodeURIComponent(token)}`,
        {},
      );
      return { ...result, live: true };
    }
    default: {
      const missing = providerFields(provider)
        .filter((field) => field.required && !(field.secret ? secrets[field.key] : plain[field.key]))
        .map((field) => field.label);
      if (missing.length > 0) {
        return { ok: false, message: `Faltam campos: ${missing.join(", ")}.`, live: false };
      }
      return { ok: true, message: "Configuração completa (sem teste automático para este provedor).", live: false };
    }
  }
}
