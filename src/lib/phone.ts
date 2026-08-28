/**
 * Normalização e validação de telefone brasileiro.
 *
 * Guardamos sempre a versão E.164 (+55DDNNNNNNNNN) para poder localizar o
 * cliente com segurança, sem depender de como ele digitou o número.
 */

export interface NormalizedPhone {
  ok: boolean;
  /** Formato internacional, ex.: +5565912345678. Vazio quando inválido. */
  e164: string;
  /** Somente dígitos nacionais (DDD + número). */
  national: string;
  message: string;
}

const INVALID = "Informe um telefone válido com DDD, por exemplo (65) 91234-5678.";

export function normalizePhoneBR(value: string): NormalizedPhone {
  let raw = (value ?? "").replace(/\D/g, "");
  if (raw.startsWith("0055")) raw = raw.slice(4);
  if (raw.length > 11 && raw.startsWith("55")) raw = raw.slice(2);
  raw = raw.replace(/^0+/, "");

  const fail = (): NormalizedPhone => ({ ok: false, e164: "", national: raw, message: INVALID });

  if (raw.length !== 10 && raw.length !== 11) return fail();

  const ddd = Number(raw.slice(0, 2));
  if (ddd < 11 || ddd > 99) return fail();

  const subscriber = raw.slice(2);
  // Celular: 9 dígitos começando com 9. Fixo: 8 dígitos começando de 2 a 5.
  const isMobile = subscriber.length === 9 && subscriber.startsWith("9");
  const isLandline = subscriber.length === 8 && /^[2-5]/.test(subscriber);
  if (!isMobile && !isLandline) return fail();
  if (/^(\d)\1+$/.test(subscriber)) return fail();

  return { ok: true, e164: `+55${raw}`, national: raw, message: "" };
}

/** Mostra apenas os últimos dígitos: (65) *****-5678. */
export function maskPhoneForDisplay(e164: string): string {
  const digits = (e164 ?? "").replace(/\D/g, "").slice(-11);
  if (digits.length < 6) return "•••••";
  const ddd = digits.slice(0, 2);
  const tail = digits.slice(-4);
  return `(${ddd}) *****-${tail}`;
}
