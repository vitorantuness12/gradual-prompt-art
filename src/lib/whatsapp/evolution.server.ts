/**
 * Cliente da Evolution API (somente servidor).
 *
 * A API key global e os tokens de instância nunca saem daqui: as funções de
 * servidor devolvem apenas dados públicos (status, número, nome do perfil).
 */

export interface GlobalSettingsRow {
  id: string;
  base_url: string | null;
  api_key: string | null;
  environment: string;
  webhook_base_url: string | null;
  webhook_secret: string | null;
  integration: string;
  events: unknown;
  timeout_ms: number;
  max_retries: number;
  retry_delay_ms: number;
  is_enabled: boolean;
}

export interface EvolutionResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

export const DEFAULT_EVENTS = [
  "QRCODE_UPDATED",
  "CONNECTION_UPDATE",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "SEND_MESSAGE",
];

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Mensagens de erro amigáveis — nunca vazam token, payload ou stack. */
export function friendlyError(status: number, raw?: string): string {
  if (status === 0) return "A Evolution API não respondeu. Verifique se o servidor está no ar.";
  if (status === 401 || status === 403) return "API key da Evolution recusada. Cadastre a credencial novamente.";
  if (status === 404) return "Recurso não encontrado na Evolution API.";
  if (status === 409) return "Já existe uma instância com esse nome na Evolution API.";
  if (status === 429) return "Muitas requisições para a Evolution API. Tente em instantes.";
  if (status >= 500) return "A Evolution API está indisponível no momento.";
  if (raw && raw.length < 160 && !/token|apikey|bearer/i.test(raw)) return raw;
  return "Não foi possível concluir a operação na Evolution API.";
}

/** Requisição com timeout, tentativas e backoff. */
export async function evolutionRequest<T = unknown>(
  settings: GlobalSettingsRow,
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<EvolutionResult<T>> {
  if (!settings.base_url || !settings.api_key) {
    return { ok: false, status: 0, data: null, error: "Evolution API não configurada." };
  }

  const url = `${normalizeBase(settings.base_url)}${path}`;
  const attempts = Math.max(1, Math.min(settings.max_retries ?? 3, 5));
  let last: EvolutionResult<T> = { ok: false, status: 0, data: null, error: "Falha de conexão." };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(3000, settings.timeout_ms ?? 15000));
    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          apikey: options.token ?? settings.api_key,
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal,
      });
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      if (response.ok) return { ok: true, status: response.status, data: parsed as T };
      last = {
        ok: false,
        status: response.status,
        data: parsed as T,
        error: friendlyError(response.status, typeof parsed === "string" ? parsed : undefined),
      };
      // Erros de credencial/conflito não se resolvem com retentativa.
      if (response.status < 500 && response.status !== 429) return last;
    } catch {
      last = { ok: false, status: 0, data: null, error: friendlyError(0) };
    } finally {
      clearTimeout(timer);
    }
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, (settings.retry_delay_ms ?? 2000) * attempt));
    }
  }
  return last;
}

/** Verifica se a API está no ar e devolve a versão detectada. */
export async function checkApi(settings: GlobalSettingsRow): Promise<{ ok: boolean; message: string; version: string | null }> {
  const result = await evolutionRequest<{ version?: string; message?: string }>(settings, "/");
  if (!result.ok) return { ok: false, message: result.error ?? "Falha de conexão.", version: null };
  const version = (result.data as { version?: string } | null)?.version ?? null;
  // Valida a API key com um endpoint autenticado.
  const instances = await evolutionRequest<unknown[]>(settings, "/instance/fetchInstances");
  if (!instances.ok) return { ok: false, message: instances.error ?? "API key recusada.", version };
  return { ok: true, message: `Conexão estabelecida${version ? ` (versão ${version})` : ""}.`, version };
}

export function webhookUrlFor(settings: GlobalSettingsRow, instanceKey: string): string {
  const base = normalizeBase(settings.webhook_base_url || "");
  return `${base}/api/public/evolution/${instanceKey}`;
}

export function eventList(settings: GlobalSettingsRow): string[] {
  const events = settings.events;
  if (Array.isArray(events) && events.length > 0) return events.map(String);
  return DEFAULT_EVENTS;
}

/** Cria a instância da loja com webhook próprio já configurado. */
export async function createInstance(
  settings: GlobalSettingsRow,
  instanceName: string,
  webhookUrl: string,
): Promise<EvolutionResult<{ instance?: { instanceId?: string; instanceName?: string; status?: string }; hash?: unknown; qrcode?: { base64?: string; code?: string } }>> {
  return evolutionRequest(settings, "/instance/create", {
    method: "POST",
    body: {
      instanceName,
      qrcode: true,
      integration: settings.integration || "WHATSAPP-BAILEYS",
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: true,
        headers: settings.webhook_secret
          ? { authorization: `Bearer ${settings.webhook_secret}`, "content-type": "application/json" }
          : { "content-type": "application/json" },
        events: eventList(settings),
      },
    },
  });
}

/** Reconfigura o webhook de uma instância existente. */
export async function setWebhook(
  settings: GlobalSettingsRow,
  instanceName: string,
  webhookUrl: string,
): Promise<EvolutionResult> {
  return evolutionRequest(settings, `/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: {
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: true,
        headers: settings.webhook_secret
          ? { authorization: `Bearer ${settings.webhook_secret}`, "content-type": "application/json" }
          : { "content-type": "application/json" },
        events: eventList(settings),
      },
    },
  });
}

export async function connectInstance(settings: GlobalSettingsRow, instanceName: string) {
  return evolutionRequest<{ base64?: string; code?: string; pairingCode?: string; count?: number }>(
    settings,
    `/instance/connect/${encodeURIComponent(instanceName)}`,
  );
}

export async function connectionState(settings: GlobalSettingsRow, instanceName: string) {
  return evolutionRequest<{ instance?: { state?: string; instanceName?: string } }>(
    settings,
    `/instance/connectionState/${encodeURIComponent(instanceName)}`,
  );
}

export async function fetchInstance(settings: GlobalSettingsRow, instanceName: string) {
  return evolutionRequest<unknown>(
    settings,
    `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
  );
}

export async function logoutInstance(settings: GlobalSettingsRow, instanceName: string) {
  return evolutionRequest(settings, `/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
}

export async function deleteInstance(settings: GlobalSettingsRow, instanceName: string) {
  return evolutionRequest(settings, `/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
}

export async function sendText(
  settings: GlobalSettingsRow,
  instanceName: string,
  token: string | null,
  number: string,
  text: string,
) {
  return evolutionRequest<{ key?: { id?: string }; status?: string }>(
    settings,
    `/message/sendText/${encodeURIComponent(instanceName)}`,
    { method: "POST", body: { number, text }, token },
  );
}

/** Normaliza o telefone para o formato aceito pelo WhatsApp (E.164 sem "+"). */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/** Nome único da instância a partir do identificador da loja (sem dado sensível). */
export function instanceNameFor(storeId: string): string {
  return `store_${storeId.replace(/-/g, "").slice(0, 12)}_whatsapp`;
}
