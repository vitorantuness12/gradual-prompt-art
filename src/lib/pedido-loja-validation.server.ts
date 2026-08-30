import { z } from "zod";

import type { PedidoLojaInput } from "@/lib/pedido-loja";

const itemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullish(),
  variantName: z.string().nullish(),
  productName: z.string().trim().min(1),
  quantity: z.number().finite().positive(),
  unitPrice: z.number().finite().min(0),
  notes: z.string().nullish(),
  options: z
    .array(z.object({ groupName: z.string(), optionName: z.string() }))
    .optional(),
  fromUpsell: z.boolean().optional(),
});

const offerSchema = z.object({
  offerId: z.string().uuid(),
  productId: z.string().uuid(),
  name: z.string().trim().min(1),
  price: z.number().finite().min(0),
});

const pedidoLojaSchema = z.object({
  storeSlug: z.string().trim().min(1),
  customerName: z.string().trim().min(1),
  customerPhone: z.string().min(8),
  customerEmail: z.string().nullish(),
  type: z.enum(["delivery", "pickup", "dine_in", "scheduled", "counter"]),
  tableNumber: z.string().nullish(),
  distanceKm: z.number().finite().nullish(),
  deliveryLat: z.number().finite().nullish(),
  deliveryLng: z.number().finite().nullish(),
  address: z.record(z.string(), z.string()).nullish(),
  notes: z.string().nullish(),
  subtotal: z.number().finite().min(0),
  deliveryFee: z.number().finite().min(0),
  discount: z.number().finite().min(0),
  couponCode: z.string().nullish(),
  cashbackUsed: z.number().finite().min(0),
  referralCode: z.string().nullish(),
  upsellItems: z.number().int().min(0),
  upsellTotal: z.number().finite().min(0),
  total: z.number().finite().min(0),
  paymentMethod: z.string().trim().min(1),
  scheduledFor: z.string().nullish(),
  channel: z.string().trim().min(1),
  affiliateCode: z.string().nullish(),
  utmSource: z.string().nullish(),
  utmMedium: z.string().nullish(),
  utmCampaign: z.string().nullish(),
  utmContent: z.string().nullish(),
  items: z.array(itemSchema).min(1),
  offers: z.array(offerSchema).optional(),
});

export type PedidoLojaValidationResult =
  | { success: true; data: PedidoLojaInput }
  | { success: false; message: string };

export function validatePedidoLoja(input: unknown): PedidoLojaValidationResult {
  const result = pedidoLojaSchema.safeParse(input);
  if (result.success) {
    // O schema acima valida integralmente a estrutura compartilhada. O cast
    // reconcilia apenas propriedades opcionais sob exactOptionalPropertyTypes.
    return { success: true, data: result.data as PedidoLojaInput };
  }

  const issue = result.error.issues[0];
  const field = issue?.path.join(".");
  return {
    success: false,
    message: field
      ? `Confira os dados do pedido (${field}) e tente novamente.`
      : "Confira os dados do pedido e tente novamente.",
  };
}