import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fiscalInvoicesKey, fiscalOrdersKey, isValidDocument, type FiscalOrderOption } from "@/lib/fiscal";
import { issueFiscalInvoice } from "@/lib/fiscal.functions";
import { formatCurrency } from "@/lib/format";

export interface FiscalIssueCardProps {
  storeId: string;
  orders: FiscalOrderOption[];
}

/** Escolha do pedido e dados do cliente para gerar a nota. */
export function FiscalIssueCard({ storeId, orders }: FiscalIssueCardProps) {
  const queryClient = useQueryClient();
  const [orderId, setOrderId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [document, setDocument] = useState("");
  const [description, setDescription] = useState("");

  const pending = orders.filter((order) => order.invoiceStatus !== "issued");

  const issue = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error("Escolha o pedido.");
      if (document && !isValidDocument(document)) throw new Error("CPF ou CNPJ inválido.");
      const result = await issueFiscalInvoice({
        data: { storeId, orderId, customerName, customerDocument: document, description },
      });
      if (!result.ok) throw new Error(result.message);
      return result.message;
    },
    onSuccess: async (message) => {
      toast.success(message);
      setOrderId("");
      setDocument("");
      setCustomerName("");
      setDescription("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: fiscalInvoicesKey(storeId) }),
        queryClient.invalidateQueries({ queryKey: fiscalOrdersKey(storeId) }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function selectOrder(value: string) {
    setOrderId(value);
    const order = orders.find((item) => item.id === value);
    setCustomerName(order?.customerName ?? "");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Emitir nota de um pedido</CardTitle>
        <CardDescription>Pedidos reais dos últimos 90 dias que ainda não têm nota emitida.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pedido pendente de nota no momento.</p>
        ) : (
          <>
            <div className="grid gap-2">
              <Label>Pedido</Label>
              <Select value={orderId} onValueChange={selectOrder}>
                <SelectTrigger><SelectValue placeholder="Escolha o pedido" /></SelectTrigger>
                <SelectContent>
                  {pending.map((order) => (
                    <SelectItem key={order.id} value={order.id}>
                      {`#${order.code ?? order.id.slice(0, 6)} · ${formatCurrency(order.total)} · ${
                        order.customerName ?? "sem nome"
                      }`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Nome do cliente</Label>
                <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>CPF ou CNPJ do cliente</Label>
                <Input
                  value={document}
                  onChange={(event) => setDocument(event.target.value)}
                  placeholder="opcional"
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Descrição desta nota</Label>
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="deixe vazio para usar a descrição padrão"
              />
            </div>

            <Button onClick={() => issue.mutate()} disabled={issue.isPending || !orderId} className="justify-self-start">
              {issue.isPending ? "Enviando..." : "Emitir nota"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
