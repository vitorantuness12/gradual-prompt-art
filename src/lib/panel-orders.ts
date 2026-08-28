/** Tipos compartilhados entre a listagem de pedidos e o detalhe do pedido no painel. */
import type { Database } from "@/integrations/supabase/types";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];

export interface PanelOrderItem {
  id: string;
  product_name: string;
  quantity: number;
  total: number | string;
  notes: string | null;
}

export type PanelOrder = OrderRow & {
  order_items: PanelOrderItem[] | null;
};
