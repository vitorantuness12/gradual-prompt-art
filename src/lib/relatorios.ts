export type CsvRow = Record<string, string | number>;

/** Converte linhas em CSV compatível com Excel (ponto e vírgula + BOM). */
export function toCsv(rows: CsvRow[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const escape = (value: string | number) => {
    const text = String(value ?? "");
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.join(";"), ...rows.map((row) => headers.map((key) => escape(row[key] ?? "")).join(";"))];
  return `\uFEFF${lines.join("\n")}`;
}

/** Baixa um arquivo CSV no navegador. */
export function downloadCsv(name: string, rows: CsvRow[]) {
  const csv = toCsv(rows);
  if (!csv) return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Exporta o relatório em PDF usando a impressão do navegador (salvar como PDF). */
export function printReport() {
  window.print();
}
