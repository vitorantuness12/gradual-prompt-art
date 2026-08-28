/**
 * Etiquetas de gôndola: geração de EAN-13 interno, desenho do código de barras
 * em SVG e folha de impressão pronta para etiquetadoras e papel A4.
 */

const L = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];
const G = [
  "0100111", "0110011", "0011011", "0100001", "0011101",
  "0111001", "0000101", "0010001", "0001001", "0010111",
];
const R = [
  "1110010", "1100110", "1101100", "1000010", "1011100",
  "1001110", "1010000", "1000100", "1001000", "1110100",
];
const PARITY = [
  "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
  "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
];

/** Dígito verificador do padrão EAN-13 (12 dígitos de entrada). */
export function ean13CheckDigit(base12: string): number {
  const digits = base12.padStart(12, "0").slice(0, 12).split("").map(Number);
  const sum = digits.reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 13) return false;
  return ean13CheckDigit(clean.slice(0, 12)) === Number(clean[12]);
}

/**
 * EAN-13 de uso interno. O prefixo 200–299 é reservado pelo GS1 para
 * numeração livre dentro do estabelecimento, então não conflita com
 * códigos de fabricantes.
 */
export function generateInternalEan(sequence: number): string {
  const base = `200${String(Math.abs(Math.trunc(sequence)) % 1_000_000_000).padStart(9, "0")}`;
  return `${base}${ean13CheckDigit(base)}`;
}

/** Sequência baseada no relógio, para gerar códigos únicos sem consultar o banco. */
export function nextInternalEan(offset = 0): string {
  return generateInternalEan(Math.floor(Date.now() / 1000) + offset);
}

/** Desenha o código de barras EAN-13 como SVG (sem dependências externas). */
export function ean13Svg(code: string, options?: { width?: number; height?: number }): string {
  const clean = code.replace(/\D/g, "").padStart(13, "0").slice(0, 13);
  const digits = clean.split("").map(Number);
  const parity = PARITY[digits[0]!]!;

  let bits = "101";
  for (let index = 1; index <= 6; index += 1) {
    const table = parity[index - 1] === "L" ? L : G;
    bits += table[digits[index]!]!;
  }
  bits += "01010";
  for (let index = 7; index <= 12; index += 1) {
    bits += R[digits[index]!]!;
  }
  bits += "101";

  const moduleWidth = 2;
  const width = options?.width ?? bits.length * moduleWidth;
  const height = options?.height ?? 48;
  const scale = width / (bits.length * moduleWidth);
  const barHeight = height - 12;

  let bars = "";
  bits.split("").forEach((bit, index) => {
    if (bit !== "1") return;
    bars += `<rect x="${(index * moduleWidth * scale).toFixed(2)}" y="0" width="${(moduleWidth * scale).toFixed(2)}" height="${barHeight}" fill="#000"/>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${bars}<text x="${width / 2}" y="${height - 1}" font-family="monospace" font-size="10" text-anchor="middle" fill="#000">${clean}</text></svg>`;
}

export interface LabelInput {
  name: string;
  detail?: string | null;
  price: number;
  code?: string | null;
  sku?: string | null;
}

/** Abre a folha de etiquetas pronta para impressão (3 colunas em A4). */
export function printLabels(labels: LabelInput[], storeName: string, copiesPerLabel = 1) {
  const expanded = labels.flatMap((label) => Array.from({ length: Math.max(1, copiesPerLabel) }, () => label));
  const cards = expanded
    .map((label) => {
      const price = label.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const barcode = label.code ? ean13Svg(label.code, { width: 180, height: 46 }) : "";
      return `<div class="label">
        <p class="store">${escapeHtml(storeName)}</p>
        <p class="name">${escapeHtml(label.name)}</p>
        ${label.detail ? `<p class="detail">${escapeHtml(label.detail)}</p>` : ""}
        <p class="price">${price}</p>
        ${barcode || (label.sku ? `<p class="detail">SKU ${escapeHtml(label.sku)}</p>` : "")}
      </div>`;
    })
    .join("");

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 8mm; }
    .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
    .label { border: 1px dashed #999; border-radius: 4px; padding: 6px; text-align: center; page-break-inside: avoid; }
    .store { font-size: 8px; text-transform: uppercase; letter-spacing: .5px; color: #666; margin: 0; }
    .name { font-size: 12px; font-weight: 700; margin: 2px 0 0; }
    .detail { font-size: 9px; color: #444; margin: 1px 0; }
    .price { font-size: 16px; font-weight: 800; margin: 3px 0; }
    @media print { .label { border-color: #ccc; } }
  </style></head>
  <body><div class="sheet">${cards}</div>
  <script>window.onload = () => { window.print(); };<\/script>
  </body></html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
