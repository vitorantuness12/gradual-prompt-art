import { describe, expect, it } from "vitest";

import {
  buildAgendaSlots,
  canReleaseDigital,
  currentUnitPrice,
  depositForService,
  installmentOptions,
  orderTotals,
  quoteShipping,
  revalidateCart,
  type CatalogProduct,
  type CatalogVariant,
  type SchedulingConfig,
  type ShippingZone,
} from "@/lib/checkout-especializado";
import { CHECKOUT_MODEL_PATH, checkoutPathFor, resolveCheckoutModel } from "@/lib/checkout-model";

function zone(overrides: Partial<ShippingZone> = {}): ShippingZone {
  return {
    id: "z1",
    label: "Zona 1",
    rule_type: "fixed",
    district: null,
    zip_start: null,
    zip_end: null,
    distance_min_km: 0,
    distance_max_km: null,
    weight_max_grams: null,
    fee: 10,
    min_fee: 0,
    price_per_km: 0,
    free_above: null,
    min_order_value: 0,
    eta_minutes: 40,
    is_active: true,
    sort_order: 0,
    ...overrides,
  };
}

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "p1",
    name: "Camiseta",
    price: 50,
    promo_price: null,
    is_active: true,
    is_available: true,
    track_stock: false,
    stock_quantity: 0,
    max_quantity_per_order: null,
    weight_grams: 300,
    kind: "product",
    ...overrides,
  };
}

const config: SchedulingConfig = {
  slot_minutes: 30,
  open_time: "09:00",
  close_time: "12:00",
  require_deposit: false,
  deposit_percent: 0,
};

describe("frete da loja online", () => {
  it("usa a taxa fixa quando não há regra por endereço", () => {
    const quote = quoteShipping([zone()], { subtotal: 100 });
    expect(quote.ok).toBe(true);
    expect(quote.fee).toBe(10);
  });

  it("aplica frete grátis acima do valor configurado", () => {
    const quote = quoteShipping([zone({ free_above: 80 })], { subtotal: 120 });
    expect(quote.free).toBe(true);
    expect(quote.fee).toBe(0);
  });

  it("cobra por km na regra de distância respeitando o mínimo", () => {
    const quote = quoteShipping(
      [zone({ rule_type: "distance", fee: 5, price_per_km: 2, min_fee: 8, distance_max_km: 10 })],
      { subtotal: 60, distanceKm: 4 },
    );
    expect(quote.fee).toBe(13);
  });

  it("recusa CEP fora das faixas cadastradas", () => {
    const quote = quoteShipping([zone({ rule_type: "zip", zip_start: "01000000", zip_end: "01999999" })], {
      subtotal: 60,
      zip: "20000000",
    });
    expect(quote.ok).toBe(false);
    expect(quote.reason).toBe("no_match");
  });

  it("pede o CEP quando a regra depende do endereço", () => {
    const quote = quoteShipping([zone({ rule_type: "zip" })], { subtotal: 60 });
    expect(quote.reason).toBe("missing_address");
  });

  it("bloqueia pedido abaixo do mínimo da zona", () => {
    const quote = quoteShipping([zone({ min_order_value: 80 })], { subtotal: 40 });
    expect(quote.ok).toBe(false);
    expect(quote.reason).toBe("below_min_order");
  });

  it("não trava a compra quando a loja não cadastrou zonas", () => {
    const quote = quoteShipping([], { subtotal: 40 });
    expect(quote.ok).toBe(true);
    expect(quote.reason).toBe("no_zones");
  });
});

describe("revalidação de preço e estoque", () => {
  it("recalcula o preço pelo catálogo, ignorando o valor do navegador", () => {
    const result = revalidateCart([{ productId: "p1", quantity: 2 }], [product({ promo_price: 40 })]);
    expect(result.ok).toBe(true);
    expect(result.subtotal).toBe(80);
    expect(result.weightGrams).toBe(600);
  });

  it("recusa quantidade acima do estoque", () => {
    const result = revalidateCart(
      [{ productId: "p1", quantity: 5 }],
      [product({ track_stock: true, stock_quantity: 2 })],
    );
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain("restam apenas 2");
  });

  it("recusa produto indisponível", () => {
    const result = revalidateCart([{ productId: "p1", quantity: 1 }], [product({ is_available: false })]);
    expect(result.ok).toBe(false);
  });

  it("respeita o limite por pedido", () => {
    const result = revalidateCart(
      [{ productId: "p1", quantity: 4 }],
      [product({ max_quantity_per_order: 2 })],
    );
    expect(result.ok).toBe(false);
  });

  it("usa o preço da variação quando existe", () => {
    const variant: CatalogVariant = {
      id: "v1",
      product_id: "p1",
      price: 70,
      stock_quantity: 5,
      is_active: true,
      option1_value: "M",
      option2_value: "Azul",
    };
    const result = revalidateCart([{ productId: "p1", variantId: "v1", quantity: 1 }], [product()], [variant]);
    expect(result.lines[0]?.unitPrice).toBe(70);
    expect(result.lines[0]?.variantName).toBe("M / Azul");
  });

  it("prefere o preço promocional na leitura unitária", () => {
    expect(currentUnitPrice(product({ promo_price: 30 }))).toBe(30);
    expect(currentUnitPrice(product({ promo_price: 60 }))).toBe(50);
  });

  it("nunca deixa o desconto passar do subtotal", () => {
    expect(orderTotals({ subtotal: 50, shipping: 10, discount: 100 })).toEqual({
      subtotal: 50,
      shipping: 10,
      discount: 50,
      total: 10,
    });
  });
});

describe("disponibilidade de agendamento", () => {
  const now = new Date("2030-05-10T00:00:00");

  it("gera horários dentro do expediente", () => {
    const slots = buildAgendaSlots({ date: "2030-05-10", durationMinutes: 30, config, now, minLeadMinutes: 0 });
    expect(slots.map((slot) => slot.label)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]);
  });

  it("remove horário já ocupado pelo profissional", () => {
    const slots = buildAgendaSlots({
      date: "2030-05-10",
      durationMinutes: 30,
      config,
      professionalId: "pro-1",
      busy: [{ professional_id: "pro-1", starts_at: "2030-05-10T09:00:00", ends_at: "2030-05-10T09:30:00" }],
      now,
      minLeadMinutes: 0,
    });
    expect(slots.map((slot) => slot.label)).not.toContain("09:00");
  });

  it("ignora agenda de outro profissional", () => {
    const slots = buildAgendaSlots({
      date: "2030-05-10",
      durationMinutes: 30,
      config,
      professionalId: "pro-1",
      busy: [{ professional_id: "pro-2", starts_at: "2030-05-10T09:00:00", ends_at: "2030-05-10T09:30:00" }],
      now,
      minLeadMinutes: 0,
    });
    expect(slots.map((slot) => slot.label)).toContain("09:00");
  });

  it("respeita bloqueio recorrente por dia da semana", () => {
    const weekday = new Date("2030-05-10T09:00:00").getDay();
    const slots = buildAgendaSlots({
      date: "2030-05-10",
      durationMinutes: 30,
      config,
      blocks: [
        {
          professional_id: null,
          is_recurring: true,
          weekday,
          start_time: "09:00",
          end_time: "10:00",
          starts_at: null,
          ends_at: null,
        },
      ],
      now,
      minLeadMinutes: 0,
    });
    expect(slots.map((slot) => slot.label)).toEqual(["10:00", "10:30", "11:00", "11:30"]);
  });

  it("descarta horários que não cabem antes do fechamento", () => {
    const slots = buildAgendaSlots({ date: "2030-05-10", durationMinutes: 120, config, now, minLeadMinutes: 0 });
    expect(slots.map((slot) => slot.label)).toEqual(["09:00", "09:30", "10:00"]);
  });

  it("calcula o sinal só quando a loja exige", () => {
    expect(depositForService(200, config)).toBe(0);
    expect(depositForService(200, { ...config, require_deposit: true, deposit_percent: 30 })).toBe(60);
  });
});

describe("liberação de produto digital", () => {
  it("não libera sem pagamento confirmado", () => {
    expect(canReleaseDigital({ paymentStatus: "pending", total: 100 })).toBe(false);
  });

  it("não libera com valor pago menor que o pedido", () => {
    expect(canReleaseDigital({ paymentStatus: "paid", total: 100, paidAmount: 40 })).toBe(false);
  });

  it("libera com pagamento confirmado e valor correto", () => {
    expect(canReleaseDigital({ paymentStatus: "paid", total: 100, paidAmount: 100 })).toBe(true);
  });

  it("oferece parcelas coerentes com o valor", () => {
    expect(installmentOptions(20).length).toBe(1);
    expect(installmentOptions(240).length).toBe(12);
  });
});

describe("delivery permanece no fluxo original", () => {
  it("mantém a rota de checkout de restaurantes intacta", () => {
    expect(CHECKOUT_MODEL_PATH.delivery).toBe("/checkout");
    const store = {
      segment: "restaurante",
      checkout_type: null,
      accepts_delivery: true,
      accepts_scheduling: false,
      accepts_dine_in: true,
    };
    expect(resolveCheckoutModel(store)).toBe("delivery");
    expect(checkoutPathFor("pizzaria", store)).toBe("/pizzaria/checkout");
  });

  it("encaminha serviços e digitais para suas telas próprias", () => {
    expect(
      checkoutPathFor("barbearia", {
        segment: "barbearia",
        checkout_type: null,
        accepts_delivery: false,
        accepts_scheduling: true,
        accepts_dine_in: false,
      }),
    ).toBe("/barbearia/checkout/agendamento");
    expect(
      checkoutPathFor("curso", {
        segment: "infoproduto",
        checkout_type: "digital",
        accepts_delivery: false,
        accepts_scheduling: false,
        accepts_dine_in: false,
      }),
    ).toBe("/curso/checkout/digital");
  });
});
