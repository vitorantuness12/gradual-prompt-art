/** Máscaras e validações de documentos e telefones brasileiros. */

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

/** (11) 91234-5678 */
export function maskPhone(value: string): string {
  const raw = digits(value).slice(0, 11);
  if (raw.length <= 2) return raw.replace(/^(\d{0,2})/, "($1");
  if (raw.length <= 6) return raw.replace(/^(\d{2})(\d{0,4})/, "($1) $2");
  if (raw.length <= 10) return raw.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  return raw.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}

export function isValidPhone(value: string): boolean {
  const raw = digits(value);
  return raw.length === 10 || raw.length === 11;
}

/** 000.000.000-00 ou 00.000.000/0000-00 conforme a quantidade de dígitos. */
export function maskDocument(value: string): string {
  const raw = digits(value).slice(0, 14);
  if (raw.length <= 11) {
    return raw
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  return raw
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export function maskZip(value: string): string {
  const raw = digits(value).slice(0, 8);
  return raw.replace(/^(\d{5})(\d{1,3})$/, "$1-$2");
}

function isValidCpf(raw: string): boolean {
  if (raw.length !== 11 || /^(\d)\1{10}$/.test(raw)) return false;
  const calc = (size: number) => {
    let sum = 0;
    for (let i = 0; i < size; i += 1) sum += Number(raw[i]) * (size + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(raw[9]) && calc(10) === Number(raw[10]);
}

function isValidCnpj(raw: string): boolean {
  if (raw.length !== 14 || /^(\d)\1{13}$/.test(raw)) return false;
  const calc = (size: number) => {
    const weights = size === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < size; i += 1) sum += Number(raw[i]) * (weights[i] as number);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(raw[12]) && calc(13) === Number(raw[13]);
}

/** Aceita CPF ou CNPJ válidos. Campo vazio é tratado como "não informado". */
export function isValidDocument(value: string): boolean {
  const raw = digits(value);
  if (raw.length === 11) return isValidCpf(raw);
  if (raw.length === 14) return isValidCnpj(raw);
  return false;
}

export function onlyDigits(value: string): string {
  return digits(value);
}
