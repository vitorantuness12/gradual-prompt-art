/**
 * Impressão de pedidos: cupom térmico (58/80 mm) e folha comum (A4).
 * O HTML é gerado aqui e enviado para um iframe oculto, o que funciona
 * com qualquer impressora instalada no computador ou no celular.
 */

import { formatCurrency, formatDateTime, ORDER_TYPE_LABEL } from "@/lib/format";

export type PrintMode = "thermal" | "common";

export interface PrintSettings {
  mode: PrintMode;
  paper_width: string;
  copies: number;
  auto_print: boolean;
  printer_name: string | null;
  header_text: string | null;
  footer_text: string | null;
  show_prices: boolean;
  show_customer: boolean;
  stations: string[];
}

export function defaultPrintSettings(): PrintSettings {
  return {
    mode: "thermal",
    paper_width: "80mm",
    copies: 1,
    auto_print: false,
    printer_name: null,
    header_text: null,
    footer_text: "Obrigado pela preferência!",
    show_prices: true,
    show_customer: true,
    stations: ["Cozinha", "Bar", "Balcão"],
  };
}

export interface PrintableItem {
  product_name: string;
  quantity: number;
  unit_price: number | string;
  total: number | string;
  notes: string | null;
}

export interface PrintableOrder {
  code: string;
  type: string;
  status: string;
  created_at: string;
  customer_name: string;
  customer_phone: string | null;
  address: unknown;
  notes: string | null;
  subtotal: number | string;
  delivery_fee: number | string;
  discount: number | string;
  total: number | string;
  payment_method: string | null;
  payment_status: string;
  table_number: string | null;
  items: PrintableItem[];
}

export interface PrintableStore {
  name: string;
  phone: string | null;
  address_street: string | null;
  address_number: string | null;
  address_district: string | null;
  address_city: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function addressLine(address: unknown): string {
  if (!address || typeof address !== "object") return "";
  const raw = address as Record<string, string | undefined>;
  const parts = [
    [raw["street"], raw["number"]].filter(Boolean).join(", "),
    raw["district"],
    raw["complement"],
    raw["reference"] ? `Ref.: ${raw["reference"]}` : "",
  ].filter(Boolean);
  return parts.join(" — ");
}

/** Monta o HTML do cupom com número, itens, adicionais, cliente, endereço e pagamento. */
export function buildReceiptHtml(
  order: PrintableOrder,
  store: PrintableStore,
  settings: PrintSettings,
): string {
  const thermal = settings.mode === "thermal";
  const width = thermal ? settings.paper_width || "80mm" : "auto";
  const address = addressLine(order.address);

  const rows = order.items
    .map((item) => {
      const extras = item.notes ? `<div class="obs">${escapeHtml(item.notes)}</div>` : "";
      const price = settings.show_prices
        ? `<span class="price">${formatCurrency(Number(item.total))}</span>`
        : "";
      return `<div class="row"><span class="qty">${item.quantity}x</span><span class="name">${escapeHtml(
        item.product_name,
      )}${extras}</span>${price}</div>`;
    })
    .join("");

  const totals = settings.show_prices
    ? `
      <div class="line"><span>Subtotal</span><span>${formatCurrency(Number(order.subtotal))}</span></div>
      ${Number(order.delivery_fee) > 0 ? `<div class="line"><span>Entrega</span><span>${formatCurrency(Number(order.delivery_fee))}</span></div>` : ""}
      ${Number(order.discount) > 0 ? `<div class="line"><span>Desconto</span><span>- ${formatCurrency(Number(order.discount))}</span></div>` : ""}
      <div class="line total"><span>Total</span><span>${formatCurrency(Number(order.total))}</span></div>`
    : "";

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Pedido ${escapeHtml(order.code)}</title>
<style>
  @page { size: ${thermal ? `${width} auto` : "A4"}; margin: ${thermal ? "3mm" : "14mm"}; }
  * { box-sizing: border-box; }
  body { font-family: ${thermal ? "'Courier New', monospace" : "Arial, Helvetica, sans-serif"}; font-size: ${thermal ? "12px" : "14px"}; color: #000; margin: 0; width: ${thermal ? width : "auto"}; }
  h1 { font-size: ${thermal ? "14px" : "20px"}; margin: 0 0 2px; text-align: center; }
  .muted { color: #444; font-size: ${thermal ? "11px" : "12px"}; }
  .center { text-align: center; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; gap: 6px; margin-bottom: 3px; }
  .row .qty { min-width: 26px; font-weight: bold; }
  .row .name { flex: 1; }
  .row .price { white-space: nowrap; }
  .obs { font-size: ${thermal ? "10px" : "12px"}; color: #333; }
  .line { display: flex; justify-content: space-between; }
  .total { font-weight: bold; font-size: ${thermal ? "14px" : "16px"}; margin-top: 4px; }
  .block { margin: 6px 0; }
</style></head>
<body>
  <h1>${escapeHtml(store.name)}</h1>
  ${settings.header_text ? `<p class="center muted">${escapeHtml(settings.header_text)}</p>` : ""}
  <p class="center muted">${escapeHtml(
    [store.address_street, store.address_number].filter(Boolean).join(", ") || "",
  )}${store.phone ? ` · ${escapeHtml(store.phone)}` : ""}</p>
  <hr>
  <div class="line"><strong>PEDIDO #${escapeHtml(order.code)}</strong><span>${escapeHtml(
    ORDER_TYPE_LABEL[order.type] ?? order.type,
  )}</span></div>
  <div class="muted">${escapeHtml(formatDateTime(order.created_at))}${
    order.table_number ? ` · Mesa ${escapeHtml(order.table_number)}` : ""
  }</div>
  <hr>
  ${rows}
  ${order.notes ? `<hr><div class="block"><strong>Observações</strong><div>${escapeHtml(order.notes)}</div></div>` : ""}
  <hr>
  ${totals}
  ${
    settings.show_customer
      ? `<hr><div class="block"><strong>Cliente</strong><div>${escapeHtml(order.customer_name)}${
          order.customer_phone ? ` · ${escapeHtml(order.customer_phone)}` : ""
        }</div>${address ? `<div class="muted">${escapeHtml(address)}</div>` : ""}</div>`
      : ""
  }
  <div class="block"><strong>Pagamento</strong><div>${escapeHtml(order.payment_method ?? "Não informado")} · ${escapeHtml(
    order.payment_status === "paid" ? "Pago" : "Pendente",
  )}</div></div>
  ${settings.footer_text ? `<hr><p class="center muted">${escapeHtml(settings.footer_text)}</p>` : ""}
</body></html>`;
}

/** Envia o HTML para impressão usando um iframe oculto. */
export function printHtml(html: string, copies = 1): void {
  if (typeof window === "undefined") return;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  iframe.onload = () => {
    for (let i = 0; i < Math.max(1, copies); i += 1) {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }
    window.setTimeout(() => iframe.remove(), 1000);
  };
}

export function printOrder(order: PrintableOrder, store: PrintableStore, settings: PrintSettings): void {
  printHtml(buildReceiptHtml(order, store, settings), settings.copies);
}

/* ---------------- Impressão por setor (cozinha, bar, expedição) ---------------- */

export interface StationPrintItem {
  product_name: string;
  quantity: number;
  notes?: string | null;
  prep_station?: string | null;
}

export interface StationPrintOrder {
  code: string;
  type: string;
  created_at: string;
  table_number?: string | null;
  notes?: string | null;
  items: StationPrintItem[];
}

/** Cupom enxuto de produção: só o que aquele setor precisa preparar. */
export function buildStationHtml(input: {
  stationLabel: string;
  storeName: string;
  order: StationPrintOrder;
  items: StationPrintItem[];
  paperWidth?: string;
}): string {
  const width = input.paperWidth || "80mm";
  const rows = input.items
    .map(
      (item) =>
        `<div class="row"><span class="qty">${item.quantity}x</span><span class="name">${escapeHtml(
          item.product_name,
        )}${item.notes ? `<div class="obs">obs: ${escapeHtml(item.notes)}</div>` : ""}</span></div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(input.stationLabel)} ${escapeHtml(input.order.code)}</title>
<style>
  @page { size: ${width} auto; margin: 3mm; }
  body { font-family: 'Courier New', monospace; font-size: 13px; color: #000; margin: 0; width: ${width}; }
  h1 { font-size: 16px; margin: 0 0 4px; text-align: center; text-transform: uppercase; }
  .muted { font-size: 11px; color: #333; text-align: center; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; gap: 6px; margin-bottom: 6px; font-size: 15px; }
  .row .qty { min-width: 30px; font-weight: bold; }
  .row .name { flex: 1; font-weight: bold; }
  .obs { font-size: 12px; font-weight: normal; }
</style></head>
<body>
  <h1>${escapeHtml(input.stationLabel)}</h1>
  <p class="muted">${escapeHtml(input.storeName)}</p>
  <hr>
  <div><strong>PEDIDO #${escapeHtml(input.order.code)}</strong>${
    input.order.table_number ? ` · Mesa ${escapeHtml(input.order.table_number)}` : ""
  }</div>
  <div class="muted">${escapeHtml(formatDateTime(input.order.created_at))}</div>
  <hr>
  ${rows}
  ${input.order.notes ? `<hr><div>Obs.: ${escapeHtml(input.order.notes)}</div>` : ""}
</body></html>`;
}

/**
 * Gera e imprime uma via por setor presente no pedido.
 * Retorna os setores impressos.
 */
export function printOrderByStation(
  order: StationPrintOrder,
  storeName: string,
  options: {
    stationLabel: (station: string) => string;
    groupBy: (items: StationPrintItem[]) => { station: string; items: StationPrintItem[] }[];
    onlyStation?: string | undefined;
    paperWidth?: string | undefined;
  },
): string[] {
  const groups = options
    .groupBy(order.items)
    .filter((group) => !options.onlyStation || options.onlyStation === "todas" || group.station === options.onlyStation);

  for (const group of groups) {
    printHtml(
      buildStationHtml({
        stationLabel: options.stationLabel(group.station),
        storeName,
        order,
        items: group.items,
        ...(options.paperWidth ? { paperWidth: options.paperWidth } : {}),
      }),
      1,
    );
  }
  return groups.map((group) => options.stationLabel(group.station));
}
