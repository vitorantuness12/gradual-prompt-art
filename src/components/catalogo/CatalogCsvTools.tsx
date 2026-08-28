import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CategoryRow, ProductRow } from "@/hooks/useCatalog";
import { insertCatalogItems } from "@/lib/catalog-import";
import { CSV_COLUMNS, catalogToCsv, csvTemplate, parseCatalogCsv } from "@/lib/catalog";

interface CatalogCsvToolsProps {
  storeId: string;
  products: ProductRow[];
  categories: CategoryRow[];
  onChanged: () => void;
}

function download(filename: string, content: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Importação e exportação do catálogo em CSV, com criação automática de categorias novas. */
export function CatalogCsvTools({ storeId, products, categories, onChanged }: CatalogCsvToolsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<string[]>([]);

  async function handleFile(file: File) {
    setImporting(true);
    setReport([]);
    try {
      const content = await file.text();
      const { items, errors } = parseCatalogCsv(content);
      if (items.length === 0) {
        setReport(errors.length > 0 ? errors : ["Nenhum item válido encontrado no arquivo."]);
        return;
      }

      // Cria as categorias que ainda não existem para não perder o agrupamento do arquivo.
      const created = await insertCatalogItems({
        storeId,
        items,
        categories,
        offset: products.length,
      });

      setReport([`${created} itens importados com sucesso.`, ...errors]);
      toast.success(`${created} itens importados.`);
      onChanged();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao importar o arquivo.";
      setReport([message]);
      toast.error(message);
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Exportar catálogo</CardTitle>
          <CardDescription>Baixe todos os itens em CSV para editar em planilha.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant="outline"
            onClick={() => download("catalogo.csv", catalogToCsv(products, categories))}
            disabled={products.length === 0}
          >
            <Download className="mr-2 size-4" aria-hidden="true" /> Baixar catálogo ({products.length})
          </Button>
          <Button variant="ghost" onClick={() => download("modelo-catalogo.csv", csvTemplate())}>
            Baixar modelo de importação
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Importar catálogo</CardTitle>
          <CardDescription>
            Colunas aceitas: {CSV_COLUMNS.join(", ")}. Categorias inexistentes são criadas automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="Arquivo CSV do catálogo"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={importing}>
            <Upload className="mr-2 size-4" aria-hidden="true" />
            {importing ? "Importando..." : "Selecionar arquivo CSV"}
          </Button>
          {report.length > 0 ? (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {report.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
