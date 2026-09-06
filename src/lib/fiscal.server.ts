/**
 * Emissores fiscais reais (NFS-e) usados pelo módulo de Nota fiscal.
 *
 * Cada adaptador recebe as credenciais salvas em `integration_credentials`
 * (kind = "fiscal") e um documento normalizado, envia à API do emissor e
 * devolve sempre o mesmo formato de resposta. Quando não há emissor conectado
 * o modo `manual` apenas registra a nota internamente — nada sai para fora.
 */

export interface FiscalCredentials {
  apiKey: string | null;
  companyId: string | null;
}

export interface FiscalDocumentInput {
  /** Referência única no emissor (usamos o id da nota interna). */
  reference: string;
  amount: number;
  taxPercent: number;
  description: string;
  serviceCode: string | null;
  cnae: string | null;
  customerName: string | null;
  /** CPF ou CNPJ do tomador, somente dígitos. */
  customerDocument: string | null;
  customerEmail: string | null;
  environment: string;
}

export interface FiscalIssueResult {
  ok: boolean;
  /** `pending` quando o emissor processa de forma assíncrona. */
  status: "pending" | "issued" | "error";
  externalId: string | null;
  number: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  message: string;
}

const TIMEOUT_MS = 20_000;

async function request(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown>; raw: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const raw = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      body = {};
    }
    return { ok: response.ok, status: response.status, body, raw };
  } catch (error) {
    const message = error instanceof Error ? error.message : "falha de rede";
    return { ok: false, status: 0, body: {}, raw: message };
  } finally {
    clearTimeout(timer);
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function shortError(raw: string, body: Record<string, unknown>, status: number): string {
  const candidate =
    text(body["mensagem"]) ??
    text(body["message"]) ??
    text(body["erro"]) ??
    text((body["error"] as Record<string, unknown> | undefined)?.["message"]) ??
    raw;
  return `Emissor recusou (${status || "sem resposta"}): ${(candidate ?? "erro desconhecido").slice(0, 240)}`;
}

/* ------------------------------------------------------------------ */
/* Focus NFe                                                           */
/* ------------------------------------------------------------------ */

function focusBase(environment: string): string {
  return environment === "producao" ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";
}

function basicAuth(token: string): string {
  return `Basic ${Buffer.from(`${token}:`).toString("base64")}`;
}

async function issueFocus(
  credentials: FiscalCredentials,
  input: FiscalDocumentInput,
): Promise<FiscalIssueResult> {
  const token = credentials.apiKey;
  if (!token) return errorResult("Token do Focus NFe não configurado.");

  const payload = {
    data_emissao: new Date().toISOString(),
    prestador: { cnpj: undefined },
    tomador: {
      cpf: input.customerDocument && input.customerDocument.length === 11 ? input.customerDocument : undefined,
      cnpj: input.customerDocument && input.customerDocument.length === 14 ? input.customerDocument : undefined,
      razao_social: input.customerName ?? "Consumidor final",
      email: input.customerEmail ?? undefined,
    },
    servico: {
      aliquota: input.taxPercent / 100,
      discriminacao: input.description,
      iss_retido: false,
      item_lista_servico: input.serviceCode ?? undefined,
      codigo_cnae: input.cnae ?? undefined,
      valor_servicos: Number(input.amount.toFixed(2)),
    },
  };

  const result = await request(
    `${focusBase(input.environment)}/v2/nfse?ref=${encodeURIComponent(input.reference)}`,
    {
      method: "POST",
      headers: { Authorization: basicAuth(token), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!result.ok) return { ...errorResult(shortError(result.raw, result.body, result.status)) };

  const status = text(result.body["status"]) ?? "processando_autorizacao";
  return {
    ok: true,
    status: status === "autorizado" ? "issued" : "pending",
    externalId: input.reference,
    number: text(result.body["numero"]),
    pdfUrl: text(result.body["caminho_danfse"]),
    xmlUrl: text(result.body["caminho_xml_nota_fiscal"]),
    message: status === "autorizado" ? "Nota autorizada." : "Nota enviada, aguardando autorização da prefeitura.",
  };
}

async function checkFocus(
  credentials: FiscalCredentials,
  reference: string,
  environment: string,
): Promise<FiscalIssueResult> {
  const token = credentials.apiKey;
  if (!token) return errorResult("Token do Focus NFe não configurado.");

  const result = await request(
    `${focusBase(environment)}/v2/nfse/${encodeURIComponent(reference)}?completa=1`,
    { method: "GET", headers: { Authorization: basicAuth(token) } },
  );
  if (!result.ok) return errorResult(shortError(result.raw, result.body, result.status));

  const status = text(result.body["status"]) ?? "processando_autorizacao";
  if (status === "erro_autorizacao" || status === "cancelado") {
    return {
      ok: false,
      status: status === "cancelado" ? "error" : "error",
      externalId: reference,
      number: null,
      pdfUrl: null,
      xmlUrl: null,
      message: text(result.body["mensagem_sefaz"]) ?? "Emissor recusou a nota.",
    };
  }
  return {
    ok: true,
    status: status === "autorizado" ? "issued" : "pending",
    externalId: reference,
    number: text(result.body["numero"]),
    pdfUrl: text(result.body["caminho_danfse"]),
    xmlUrl: text(result.body["caminho_xml_nota_fiscal"]),
    message: status === "autorizado" ? "Nota autorizada." : "Ainda em processamento no emissor.",
  };
}

/* ------------------------------------------------------------------ */
/* NFe.io                                                              */
/* ------------------------------------------------------------------ */

async function issueNfeIo(
  credentials: FiscalCredentials,
  input: FiscalDocumentInput,
): Promise<FiscalIssueResult> {
  if (!credentials.apiKey) return errorResult("API key da NFe.io não configurada.");
  if (!credentials.companyId) return errorResult("Informe o ID da empresa (company id) da NFe.io.");

  const payload = {
    borrower: {
      name: input.customerName ?? "Consumidor final",
      federalTaxNumber: input.customerDocument ? Number(input.customerDocument) : undefined,
      email: input.customerEmail ?? undefined,
    },
    cityServiceCode: input.serviceCode ?? undefined,
    description: input.description,
    servicesAmount: Number(input.amount.toFixed(2)),
    issAggregation: false,
  };

  const result = await request(
    `https://api.nfe.io/v1/companies/${encodeURIComponent(credentials.companyId)}/serviceinvoices`,
    {
      method: "POST",
      headers: { Authorization: credentials.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!result.ok) return errorResult(shortError(result.raw, result.body, result.status));

  const invoice = (result.body["serviceInvoice"] ?? result.body) as Record<string, unknown>;
  const status = (text(invoice["flowStatus"]) ?? "Issued").toLowerCase();
  return {
    ok: true,
    status: status.includes("issued") ? "issued" : status.includes("error") ? "error" : "pending",
    externalId: text(invoice["id"]),
    number: text(invoice["number"]),
    pdfUrl: text(invoice["pdfUrl"]),
    xmlUrl: text(invoice["xmlUrl"]),
    message: status.includes("issued") ? "Nota emitida." : "Nota enviada, aguardando o emissor.",
  };
}

async function checkNfeIo(
  credentials: FiscalCredentials,
  externalId: string,
): Promise<FiscalIssueResult> {
  if (!credentials.apiKey || !credentials.companyId) return errorResult("Credenciais da NFe.io incompletas.");
  const result = await request(
    `https://api.nfe.io/v1/companies/${encodeURIComponent(credentials.companyId)}/serviceinvoices/${encodeURIComponent(externalId)}`,
    { method: "GET", headers: { Authorization: credentials.apiKey } },
  );
  if (!result.ok) return errorResult(shortError(result.raw, result.body, result.status));
  const invoice = (result.body["serviceInvoice"] ?? result.body) as Record<string, unknown>;
  const status = (text(invoice["flowStatus"]) ?? "").toLowerCase();
  return {
    ok: true,
    status: status.includes("issued") ? "issued" : status.includes("cancel") ? "cancelled" as never : status.includes("error") ? "error" : "pending",
    externalId,
    number: text(invoice["number"]),
    pdfUrl: text(invoice["pdfUrl"]),
    xmlUrl: text(invoice["xmlUrl"]),
    message: status || "consulta concluída",
  };
}

/* ------------------------------------------------------------------ */
/* eNotas                                                              */
/* ------------------------------------------------------------------ */

async function issueEnotas(
  credentials: FiscalCredentials,
  input: FiscalDocumentInput,
): Promise<FiscalIssueResult> {
  if (!credentials.apiKey) return errorResult("API key do eNotas não configurada.");
  if (!credentials.companyId) return errorResult("Informe o ID da empresa no eNotas.");

  const payload = {
    tipo: "NFS-e",
    idExterno: input.reference,
    ambienteEmissao: input.environment === "producao" ? "Producao" : "Homologacao",
    cliente: {
      tipoPessoa: input.customerDocument && input.customerDocument.length === 14 ? "J" : "F",
      nome: input.customerName ?? "Consumidor final",
      cpfCnpj: input.customerDocument ?? undefined,
      email: input.customerEmail ?? undefined,
    },
    servico: {
      cnae: input.cnae ?? undefined,
      itemListaServicoLC116: input.serviceCode ?? undefined,
      descricao: input.description,
      aliquotaIss: input.taxPercent,
januario: undefined,
    },
    valorTotal: Number(input.amount.toFixed(2)),
  };

  const result = await request(
    `https://api.enotasgw.com.br/v1/empresas/${encodeURIComponent(credentials.companyId)}/nfes`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${credentials.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!result.ok) return errorResult(shortError(result.raw, result.body, result.status));

  return {
    ok: true,
    status: "pending",
    externalId: text(result.body["nfeId"]) ?? input.reference,
    number: null,
    pdfUrl: null,
    xmlUrl: null,
    message: "Nota enviada ao eNotas, aguardando autorização.",
  };
}

async function checkEnotas(
  credentials: FiscalCredentials,
  externalId: string,
): Promise<FiscalIssueResult> {
  if (!credentials.apiKey || !credentials.companyId) return errorResult("Credenciais do eNotas incompletas.");
  const result = await request(
    `https://api.enotasgw.com.br/v1/empresas/${encodeURIComponent(credentials.companyId)}/nfes/${encodeURIComponent(externalId)}`,
    { method: "GET", headers: { Authorization: `Basic ${credentials.apiKey}` } },
  );
  if (!result.ok) return errorResult(shortError(result.raw, result.body, result.status));
  const status = (text(result.body["status"]) ?? "").toLowerCase();
  return {
    ok: status !== "negada",
    status: status === "autorizada" ? "issued" : status === "negada" ? "error" : "pending",
    externalId,
    number: text(result.body["numero"]),
    pdfUrl: text(result.body["linkDownloadPDF"]),
    xmlUrl: text(result.body["linkDownloadXML"]),
    message: text(result.body["motivoStatus"]) ?? status || "consulta concluída",
  };
}

/* ------------------------------------------------------------------ */
/* Fachada                                                             */
/* ------------------------------------------------------------------ */

function errorResult(message: string): FiscalIssueResult {
  return { ok: false, status: "error", externalId: null, number: null, pdfUrl: null, xmlUrl: null, message };
}

/** Envia a nota ao emissor configurado. */
export async function issueWithProvider(
  provider: string,
  credentials: FiscalCredentials,
  input: FiscalDocumentInput,
): Promise<FiscalIssueResult> {
  switch (provider) {
    case "focus_nfe":
      return issueFocus(credentials, input);
    case "nfe_io":
      return issueNfeIo(credentials, input);
    case "enotas":
      return issueEnotas(credentials, input);
    default:
      return {
        ok: true,
        status: "issued",
        externalId: null,
        number: null,
        pdfUrl: null,
        xmlUrl: null,
        message: "Registro interno criado (nenhum emissor conectado).",
      };
  }
}

/** Consulta a situação de uma nota já enviada. */
export async function checkWithProvider(
  provider: string,
  credentials: FiscalCredentials,
  externalId: string,
  environment: string,
): Promise<FiscalIssueResult> {
  switch (provider) {
    case "focus_nfe":
      return checkFocus(credentials, externalId, environment);
    case "nfe_io":
      return checkNfeIo(credentials, externalId);
    case "enotas":
      return checkEnotas(credentials, externalId);
    default:
      return errorResult("Este registro não tem emissor para consultar.");
  }
}

/** Testa a credencial sem emitir nota. */
export async function testProvider(
  provider: string,
  credentials: FiscalCredentials,
  environment: string,
): Promise<{ ok: boolean; message: string }> {
  if (provider === "manual") return { ok: true, message: "Modo interno: nenhuma credencial necessária." };
  if (!credentials.apiKey) return { ok: false, message: "Informe a credencial do emissor." };

  if (provider === "focus_nfe") {
    const result = await request(`${focusBase(environment)}/v2/nfse?ref=teste-conexao-oseupedido`, {
      method: "GET",
      headers: { Authorization: basicAuth(credentials.apiKey) },
    });
    // 404 significa "credencial válida, referência inexistente".
    if (result.status === 401 || result.status === 403) return { ok: false, message: "Token recusado pelo Focus NFe." };
    if (result.status === 0) return { ok: false, message: "Não foi possível falar com o Focus NFe." };
    return { ok: true, message: "Credencial aceita pelo Focus NFe." };
  }

  if (provider === "nfe_io") {
    if (!credentials.companyId) return { ok: false, message: "Informe o ID da empresa da NFe.io." };
    const result = await request(`https://api.nfe.io/v1/companies/${encodeURIComponent(credentials.companyId)}`, {
      method: "GET",
      headers: { Authorization: credentials.apiKey },
    });
    return result.ok
      ? { ok: true, message: "Empresa encontrada na NFe.io." }
      : { ok: false, message: shortError(result.raw, result.body, result.status) };
  }

  if (provider === "enotas") {
    if (!credentials.companyId) return { ok: false, message: "Informe o ID da empresa no eNotas." };
    const result = await request(`https://api.enotasgw.com.br/v1/empresas/${encodeURIComponent(credentials.companyId)}`, {
      method: "GET",
      headers: { Authorization: `Basic ${credentials.apiKey}` },
    });
    return result.ok
      ? { ok: true, message: "Empresa encontrada no eNotas." }
      : { ok: false, message: shortError(result.raw, result.body, result.status) };
  }

  return { ok: false, message: "Emissor desconhecido." };
}
