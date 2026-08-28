import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import { defaultPrintSettings, printOrder, type PrintSettings } from "@/lib/print";

export const Route = createFileRoute("/_authenticated/painel/impressao")({
  component: PrintSettingsPage,
});

function PrintSettingsPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PrintSettings>(defaultPrintSettings());
  const [stationsText, setStationsText] = useState("Cozinha, Bar, Balcão");

  const { data, isLoading } = useQuery({
    queryKey: ["print-settings", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const [settings, store] = await Promise.all([
        supabase.from("print_settings").select("*").eq("store_id", storeId!).maybeSingle(),
        supabase
          .from("stores")
          .select("name, phone, address_street, address_number, address_district, address_city")
          .eq("id", storeId!)
          .maybeSingle(),
      ]);
      if (settings.error) throw new Error(settings.error.message);
      return { settings: settings.data, store: store.data };
    },
  });

  useEffect(() => {
    const settings = data?.settings;
    if (!settings) return;
    setForm({
      mode: settings.mode === "common" ? "common" : "thermal",
      paper_width: settings.paper_width,
      copies: settings.copies,
      auto_print: settings.auto_print,
      printer_name: settings.printer_name,
      header_text: settings.header_text,
      footer_text: settings.footer_text,
      show_prices: settings.show_prices,
      show_customer: settings.show_customer,
      stations: settings.stations,
    });
    setStationsText(settings.stations.join(", "));
  }, [data?.settings]);

  const save = useMutation({
    mutationFn: async () => {
      const stations = stationsText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const { error } = await supabase.from("print_settings").upsert({ store_id: storeId!, ...form, stations });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Configuração de impressão salva.");
      await queryClient.invalidateQueries({ queryKey: ["print-settings", storeId] });
    },
    onError: () => toast.error("Não foi possível salvar."),
  });

  function handleTestPrint() {
    const store = data?.store;
    printOrder(
      {
        code: "TESTE01",
        type: "delivery",
        status: "preparing",
        created_at: new Date().toISOString(),
        customer_name: "Cliente de teste",
        customer_phone: "(65) 90000-0000",
        address: { street: "Rua Exemplo", number: "100", district: "Centro" },
        notes: "Sem cebola, por favor.",
        subtotal: 54.9,
        delivery_fee: 8,
        discount: 5,
        total: 57.9,
        payment_method: "pix",
        payment_status: "paid",
        table_number: null,
        items: [
          { product_name: "Combo família", quantity: 1, unit_price: 39.9, total: 39.9, notes: "Adicionais: bacon · borda" },
          { product_name: "Refrigerante 2L", quantity: 1, unit_price: 15, total: 15, notes: null },
        ],
      },
      {
        name: store?.name ?? "Sua loja",
        phone: store?.phone ?? null,
        address_street: store?.address_street ?? null,
        address_number: store?.address_number ?? null,
        address_district: store?.address_district ?? null,
        address_city: store?.address_city ?? null,
      },
      form,
    );
  }

  if (isLoading) return <Skeleton className="h-72 rounded-2xl" />;

  return (
    <div>
      <PageHeader
        title="Impressão"
        description="Cupom térmico, folha comum e estações de preparo do monitor de cozinha."
      />

      <div className="space-y-4">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Impressora</CardTitle>
            <CardDescription>
              A impressão usa a impressora escolhida na janela do sistema. A impressão automática dispara quando o
              navegador estiver aberto no painel de pedidos.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Modo</Label>
              <Select
                value={form.mode}
                onValueChange={(value) => setForm((old) => ({ ...old, mode: value === "common" ? "common" : "thermal" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="thermal">Cupom térmico</SelectItem>
                  <SelectItem value="common">Folha comum (A4)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Largura do cupom</Label>
              <Select
                value={form.paper_width}
                onValueChange={(value) => setForm((old) => ({ ...old, paper_width: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="58mm">58 mm</SelectItem>
                  <SelectItem value="80mm">80 mm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="printer">Nome da impressora (referência)</Label>
              <Input
                id="printer"
                value={form.printer_name ?? ""}
                onChange={(event) => setForm((old) => ({ ...old, printer_name: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="copies">Cópias por pedido</Label>
              <Input
                id="copies"
                type="number"
                min={1}
                max={5}
                value={form.copies}
                onChange={(event) => setForm((old) => ({ ...old, copies: Number(event.target.value) || 1 }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/70 p-3 sm:col-span-2">
              <div>
                <p className="text-sm font-medium text-foreground">Impressão automática de novos pedidos</p>
                <p className="text-xs text-muted-foreground">Imprime assim que o pedido chega, com o painel aberto.</p>
              </div>
              <Switch
                checked={form.auto_print}
                onCheckedChange={(checked) => setForm((old) => ({ ...old, auto_print: checked }))}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Conteúdo do cupom</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="header">Cabeçalho</Label>
              <Input
                id="header"
                value={form.header_text ?? ""}
                onChange={(event) => setForm((old) => ({ ...old, header_text: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="footer">Rodapé</Label>
              <Textarea
                id="footer"
                rows={2}
                value={form.footer_text ?? ""}
                onChange={(event) => setForm((old) => ({ ...old, footer_text: event.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
              <p className="text-sm text-foreground">Mostrar valores</p>
              <Switch
                checked={form.show_prices}
                onCheckedChange={(checked) => setForm((old) => ({ ...old, show_prices: checked }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
              <p className="text-sm text-foreground">Mostrar cliente e endereço</p>
              <Switch
                checked={form.show_customer}
                onCheckedChange={(checked) => setForm((old) => ({ ...old, show_customer: checked }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="stations">Estações de preparo (separe por vírgula)</Label>
              <Input id="stations" value={stationsText} onChange={(event) => setStationsText(event.target.value)} />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending || !storeId}>
            {save.isPending ? "Salvando..." : "Salvar configuração"}
          </Button>
          <Button variant="outline" onClick={handleTestPrint}>
            Imprimir cupom de teste
          </Button>
        </div>
      </div>
    </div>
  );
}
