/**
 * Gerador de BR Code (Pix copia-e-cola) no padrão EMV® QRCPS-MPM do Banco Central.
 * Código puro, sem dependências: roda no navegador e no servidor.
 */

function emv(id: string, value: string): string {
  const size = value.length.toString().padStart(2, "0");
  return `${id}${size}${value}`;
}

/** CRC16/CCITT-FALSE, exigido no campo 63 do BR Code. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Remove acentos e caracteres não suportados pelo padrão. */
function sanitize(value: string, max: number): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .-]/g, "")
    .trim()
    .slice(0, max);
}

export type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random";

/** Normaliza a chave conforme o tipo (CPF/CNPJ e telefone só com dígitos). */
export function normalizePixKey(key: string, type: PixKeyType): string {
  const raw = key.trim();
  if (type === "cpf" || type === "cnpj") return raw.replace(/\D/g, "");
  if (type === "phone") {
    const digits = raw.replace(/\D/g, "");
    return digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
  }
  return raw;
}

export interface PixPayloadInput {
  key: string;
  keyType: PixKeyType;
  holderName: string;
  city: string;
  amount: number;
  /** Identificador da transação (aparece no extrato). Somente A-Z 0-9. */
  txid: string;
  description?: string;
}

/** Monta a string copia-e-cola do Pix. O mesmo texto alimenta o QR Code. */
export function buildPixPayload(input: PixPayloadInput): string {
  const key = normalizePixKey(input.key, input.keyType);
  const txid = sanitize(input.txid.toUpperCase().replace(/[^A-Z0-9]/g, ""), 25) || "***";

  const merchantAccount =
    emv("00", "br.gov.bcb.pix") +
    emv("01", key) +
    (input.description ? emv("02", sanitize(input.description, 40)) : "");

  const payload =
    emv("00", "01") +
    emv("01", "12") +
    emv("26", merchantAccount) +
    emv("52", "0000") +
    emv("53", "986") +
    emv("54", input.amount.toFixed(2)) +
    emv("58", "BR") +
    emv("59", sanitize(input.holderName || "LOJISTA", 25) || "LOJISTA") +
    emv("60", sanitize(input.city || "SAO PAULO", 15) || "SAO PAULO") +
    emv("62", emv("05", txid)) +
    "6304";

  return payload + crc16(payload);
}
