import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { formatCurrency } from "@/lib/format";

type AffiliateRow = Database["public"]["Tables"]["store_affiliates"]["Row"];

interface Props {
  storeId: string;
  storeSlug: string | undefined;
}

const slugifyCode = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 12);

/** Cadastro de indicadores/afiliados, link de indicação e comissão por venda. */
export function AffiliatesTab({ storeId, storeSlug }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [commission, setCommission] = useState("5");

  const affiliates = useQuery({
    queryKey: ["afiliados-loja", storeId],
    queryFn: async (): Promise<AffiliateRow[]> => {
      const { data, error } = await supabase
        .from("store_affiliates")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const sales = useQuery({
    queryKey: ["afiliados-vendas", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("affiliate_code, total")
        .eq("store_id", storeId)
        .not("affiliate_code", "is", null);
      if (error) throw error;
      const map = new Map<string, { orders: number; total: number }>();
      for (const row of data ?? []) {
        const key = String(row.affiliate_code ?? "").toUpperCase();
        const current = map.get(key) ?? { orders: 0, total: 0 };
        map.set(key, { orders: current.orders + 1, total: current.total + Number(row.total ?? 0) });
      }
      return map;
    },
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["afiliados-loja", storeId] });
  };

  const create = useMutation({
    mutationFn: async () => {
      const finalCode = slugifyCode(code || name);
      if (!name.trim() || !finalCode) throw new Error("Informe o nome e o código da indicação.");
      const { error } = await supabase.from("store_affiliates").insert({
        store_id: storeId,
        name: name.trim(),
        code: finalCode,
        phone: phone.trim() || null,
        commission_percent: Number(commission.replace(",", ".")) || 0,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Indicador cadastrado.");
      setName("");
      setCode("");
      setPhone("");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: async (row: AffiliateRow) => {
      const { error } = await supabase
        .from("store_affiliates")
        .update({ is_active: !row.is_active })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("store_affiliates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Indicador removido.");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const linkFor = (affiliateCode: string) =>
    `https://oseupedido.com.br/${storeSlug ?? ""}?indicacao=${affiliateCode}`;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Novo indicador</CardTitle>
          <CardDescription>
            Cada pessoa recebe um link próprio. Quando alguém compra por esse link, a venda é
            contada e a comissão calculada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="afiliado-nome">Nome</Label>
              <Input
                id="afiliado-nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="afiliado-codigo">Código do link</Label>
              <Input
                id="afiliado-codigo"
                value={code}
                onChange={(e) => setCode(slugifyCode(e.target.value))}
                placeholder="MARIA10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="afiliado-telefone">WhatsApp (opcional)</Label>
              <Input
                id="afiliado-telefone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="afiliado-comissao">Comissão (%)</Label>
              <Input
                id="afiliado-comissao"
                inputMode="decimal"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
              />
            </div>
            <Button type="submit" className="sm:col-span-2" disabled={create.isPending}>
              {create.isPending ? "Salvando..." : "Cadastrar indicador"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {affiliates.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !affiliates.data?.length ? (
        <EmptyState
          title="Nenhum indicador cadastrado"
          description="Cadastre clientes, influenciadores ou parceiros para divulgar a loja e ganhar comissão."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {affiliates.data.map((row) => {
            const stats = sales.data?.get(row.code.toUpperCase());
            const revenue = stats?.total ?? 0;
            return (
              <Card key={row.id} className="border-border/70 shadow-sm">
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      {row.name}
                      <Badge variant={row.is_active ? "secondary" : "outline"}>
                        {row.is_active ? "Ativo" : "Pausado"}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Código {row.code} · {row.commission_percent}% de comissão
                    </CardDescription>
                  </div>
                  <Switch
                    checked={row.is_active}
                    onCheckedChange={() => toggle.mutate(row)}
                    aria-label={`Ativar ${row.name}`}
                  />
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    {stats?.orders ?? 0} pedidos · {formatCurrency(revenue)} vendidos ·{" "}
                    {formatCurrency((revenue * Number(row.commission_percent ?? 0)) / 100)} de
                    comissão
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        void navigator.clipboard.writeText(linkFor(row.code));
                        toast.success("Link de indicação copiado.");
                      }}
                    >
                      <Copy className="size-4" /> Copiar link
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="gap-2 text-destructive"
                      onClick={() => remove.mutate(row.id)}
                    >
                      <Trash2 className="size-4" /> Remover
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
