/**
 * Server function do envio de pedido da loja (delivery/restaurante).
 *
 * Arquivo fino de propósito: apenas validação de entrada e delegação.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { PedidoLojaInput, PedidoLojaResult } from "@/lib/pedido-loja";

const itemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullish(),
  variantName: z.string().nullish(),
  productName: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().min(0),
  notes: z.string().nullish(),
});

const offerSchema = z.object({
  offerId: z.string().uuid(),
  productId: z.string().uuid(),
  name: z.string().min(1),
  price: z.number().min(0),
});

const schema = z.object({
  storeSlug: z.string().min(1),
  customerName: z.string().min(1),
  customerPhone: z.string().min(8),
  customerEmail: z.string().nullish(),
  type: z.enum(["delivery", "pickup", "dine_in", "scheduled", "counter"]),
  tableNumber: z.string().nullish(),
  distanceKm: z.number().nullish(),
  deliveryLat: z.number().nullish(),
  deliveryLng: z.number().nullish(),
  address: z.record(z.string(), z.string()).nullish(),
  notes: z.string().nullish(),
  subtotal: z.number().min(0),
  deliveryFee: z.number().min(0),
  discount: z.number().min(0),
  couponCode: z.string().nullish(),
  cashbackUsed: z.number().min(0),
  referralCode: z.string().nullish(),
  upsellItems: z.number().int().min(0),
  upsellTotal: z.number().min(0),
  total: z.number().min(0),
  paymentMethod: z.string().min(1),
  scheduledFor: z.string().nullish(),
  channel: z.string().min(1),
  affiliateCode: z.string().nullish(),
  utmSource: z.string().nullish(),
  utmMedium: z.string().nullish(),
  utmCampaign: z.string().nullish(),
  utmContent: z.string().nullish(),
  items: z.array(itemSchema).min(1),
  offers: z.array(offerSchema).optional(),
});

export const enviarPedidoLoja = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }): Promise<PedidoLojaResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { gravarPedidoLoja } = await import("@/lib/pedido-loja.server");
    return gravarPedidoLoja(supabaseAdmin, data as PedidoLojaInput);
  });
