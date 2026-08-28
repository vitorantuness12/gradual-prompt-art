import { describe, expect, it } from "vitest";

import { productAvailability, currentPrice, parseCatalogCsv } from "@/lib/catalog";
import { resolveDeliveryFee } from "@/lib/delivery";
import { customerTimeline, evaluateCoupon, fulfillmentOptions, nextStatuses, timeSlots } from "@/lib/orders";
import { hasPermission, normalizePermissions, ROLE_DEFAULT_PERMISSIONS } from "@/lib/permissions";
import { buildPixPayload, crc16, normalizePixKey } from "@/lib/pix";
import { formatLimit, isOverLimit, planLimit } from "@/lib/plans";
import { sanitizeText } from "@/lib/security.server";
import { slugify, validateSlugFormat } from "@/lib/slug";

/* ---------- Cadastro e criação de loja ---------- */

describe("cadastro e criação de loja", () => {
  it("gera endereço público a partir do nome da loja", () => {
    expect(slugify("Pizzaria do João & Cia")).toBe("pizzaria-do-joao-cia");
    expect(slugify("  Café   Central  ")).toBe("cafe-central");
  });

  it("rejeita endereços reservados e mal formados", () => {
    expect(validateSlugFormat("painel")).toBe("reserved");
    expect(validateSlugFormat("a")).toBe("short");
    expect(validateSlugFormat("Loja Com Espaço")).toBe("format");
    expect(validateSlugFormat("loja-do-ze")).toBeNull();
  });
});

/* ---------- Catálogo / produto ---------- */

describe("catálogo", () => {
  const baseProduct = {
    id: "p1",
    price: 30,
    promo_price: 24,
    is_available: true,
    is_active: true,
    track_stock: false,
    stock_quantity: 0,
    availability_days: [] as number[],
    availability_start: null,
    availability_end: null,
    unavailable_reason: null,
  };

  it("usa o preço promocional quando existir", () => {
    expect(currentPrice(baseProduct as never)).toBe(24);
    expect(currentPrice({ price: 30, promo_price: null } as never)).toBe(30);
  });

  it("marca item sem estoque como indisponível", () => {
    const result = productAvailability({ ...baseProduct, track_stock: true, stock_quantity: 0 } as never);
    expect(result.available).toBe(false);
  });

  it("importa CSV com cabeçalho válido", () => {
    const csv = "nome,preco,categoria\nCoxinha,7.5,Salgados\n";
    const parsed = parseCatalogCsv(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.items.length).toBe(1);
    expect(parsed.items[0]?.name).toBe("Coxinha");
    expect(parsed.items[0]?.price).toBeCloseTo(7.5);
  });
});

/* ---------- Carrinho e checkout ---------- */

describe("checkout", () => {
  const store = {
    accepts_delivery: true,
    accepts_pickup: true,
    accepts_dine_in: false,
    accepts_scheduling: true,
  };

  it("oferece apenas as formas de atendimento habilitadas", () => {
    const options = fulfillmentOptions(store as never).map((option) => option.value);
    expect(options).toContain("delivery");
    expect(options).toContain("pickup");
    expect(options).not.toContain("dine_in");
  });

  it("calcula a taxa pelo bairro configurado", () => {
    const zones = [
      {
        id: "z1",
        is_active: true,
        sort_order: 1,
        rule_type: "district",
        district: "Centro",
        fee: 8,
        eta_minutes: 35,
        min_order_value: 0,
        free_above: 60,
        distance_min_km: 0,
        distance_max_km: null,
        weight_max_grams: null,
        zip_start: null,
        zip_end: null,
      },
    ];
    const paid = resolveDeliveryFee(zones as never, { district: "Centro", subtotal: 40 }, 12);
    expect(paid.fee).toBe(8);

    const free = resolveDeliveryFee(zones as never, { district: "Centro", subtotal: 80 }, 12);
    expect(free.fee).toBe(0);

    const fallback = resolveDeliveryFee(zones as never, { district: "Outro", subtotal: 40 }, 12);
    expect(fallback.fee).toBe(12);
  });
});

/* ---------- Cupom ---------- */

describe("cupom", () => {
  const base = {
    code: "BEMVINDO",
    discount_type: "percent",
    discount_value: 10,
    min_order_value: 30,
    starts_at: null,
    ends_at: null,
    usage_limit: null,
    used_count: 0,
    is_active: true,
  };

  it("aplica desconto percentual", () => {
    const result = evaluateCoupon(base, 50);
    expect(result.ok).toBe(true);
    expect(result.discount).toBeCloseTo(5);
  });

  it("respeita o valor mínimo", () => {
    expect(evaluateCoupon(base, 10).ok).toBe(false);
  });

  it("bloqueia cupom expirado e sem saldo de uso", () => {
    expect(evaluateCoupon({ ...base, ends_at: "2020-01-01T00:00:00Z" }, 50).ok).toBe(false);
    expect(evaluateCoupon({ ...base, usage_limit: 2, used_count: 2 }, 50).ok).toBe(false);
  });

  it("nunca desconta mais que o subtotal", () => {
    const result = evaluateCoupon({ ...base, discount_type: "fixed", discount_value: 100, min_order_value: 0 }, 40);
    expect(result.discount).toBe(40);
  });
});

/* ---------- Pedido ---------- */

describe("pedido", () => {
  it("sugere as próximas situações conforme o tipo", () => {
    expect(nextStatuses("ready", "delivery")).toContain("out_for_delivery");
    expect(nextStatuses("ready", "pickup")).toContain("picked_up");
    expect(nextStatuses("delivered", "delivery")).toEqual(["completed"]);
  });

  it("mostra a linha do tempo correta para o cliente", () => {
    expect(customerTimeline("delivery")).toContain("out_for_delivery");
    expect(customerTimeline("pickup")).not.toContain("out_for_delivery");
  });
});

/* ---------- Pagamento simulado (Pix) ---------- */

describe("pagamento Pix", () => {
  it("normaliza a chave conforme o tipo", () => {
    expect(normalizePixKey("123.456.789-00", "cpf")).toBe("12345678900");
    expect(normalizePixKey("(65) 99999-8888", "phone")).toBe("+5565999998888");
  });

  it("gera BR Code com CRC válido", () => {
    const payload = buildPixPayload({
      key: "12345678900",
      keyType: "cpf",
      holderName: "Loja Exemplo",
      city: "Cuiaba",
      amount: 42.5,
      txid: "PEDIDO123",
    });
    expect(payload.startsWith("000201")).toBe(true);
    expect(payload).toContain("5802BR");
    const body = payload.slice(0, -4);
    expect(payload.slice(-4)).toBe(crc16(body));
  });
});

/* ---------- Agenda ---------- */

describe("agenda de serviços", () => {
  const hours = Array.from({ length: 7 }, (_, day) => ({ day, enabled: true, open: "09:00", close: "12:00" }));

  it("gera horários de 30 em 30 minutos dentro do expediente", () => {
    const slots = timeSlots(hours, "2030-06-10");
    expect(slots[0]).toBe("09:00");
    expect(slots).toContain("11:30");
    expect(slots.every((slot) => slot <= "11:30")).toBe(true);
  });

  it("não gera horários em dia fechado", () => {
    const closed = hours.map((entry) => ({ ...entry, enabled: false }));
    expect(timeSlots(closed, "2030-06-10")).toEqual([]);
  });
});

/* ---------- Permissões e planos ---------- */

describe("permissões da equipe", () => {
  it("dá acesso total a proprietário e gerente", () => {
    expect(hasPermission("owner", {}, "finance")).toBe(true);
    expect(hasPermission("manager", {}, "settings")).toBe(true);
  });

  it("restringe atendente às áreas liberadas", () => {
    const staff = ROLE_DEFAULT_PERMISSIONS["staff"] ?? {};
    expect(hasPermission("staff", staff, "orders")).toBe(true);
    expect(hasPermission("staff", staff, "finance")).toBe(false);
  });

  it("ignora chaves desconhecidas vindas do banco", () => {
    expect(normalizePermissions({ orders: true, hack: true })).toEqual({ orders: true });
  });
});

describe("limites de plano", () => {
  const plan = { limits: { users: 3, products: -1 } } as never;

  it("lê limites e formata ilimitado", () => {
    expect(planLimit(plan, "users")).toBe(3);
    expect(formatLimit(planLimit(plan, "products"))).toBe("Ilimitado");
  });

  it("bloqueia somente ao atingir o limite", () => {
    expect(isOverLimit(2, 3)).toBe(false);
    expect(isOverLimit(3, 3)).toBe(true);
    expect(isOverLimit(999, -1)).toBe(false);
  });
});

/* ---------- Sanitização ---------- */

describe("sanitização de texto livre", () => {
  it("remove marcações HTML e caracteres de controle", () => {
    expect(sanitizeText('<script>alert("x")</script> Sem cebola')).toBe('alert("x") Sem cebola');
    expect(sanitizeText("a".repeat(600), 100).length).toBe(100);
  });
});
