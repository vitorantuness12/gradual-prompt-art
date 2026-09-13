import { describe, expect, it } from "vitest";

import {
  CHECKOUT_MODEL_PATH,
  allowedCheckoutModels,
  checkoutPathFor,
  resolveCheckoutModel,
} from "@/lib/checkout-model";

/**
 * Testes de regressão do roteamento de checkout.
 * O objetivo principal é garantir que lojas de alimentação e entrega continuem
 * caindo no checkout atual (`/checkout`), sem desvio para modelos novos.
 */
describe("modelo de checkout por segmento", () => {
  it("mantém o checkout atual para alimentação/delivery", () => {
    const store = { segment: "Hamburgueria", accepts_delivery: true };
    expect(resolveCheckoutModel(store)).toBe("delivery");
    expect(checkoutPathFor("burguer", store)).toBe("/burguer/checkout");
  });

  it("mantém o checkout atual para restaurante com mesas", () => {
    expect(resolveCheckoutModel({ segment: "Restaurante", accepts_dine_in: true })).toBe("delivery");
  });

  it("mantém serviços antigos no checkout principal", () => {
    expect(resolveCheckoutModel({ segment: "Barbearia" })).toBe("delivery");
  });

  it("envia configurações digitais antigas para o checkout seguro de loja", () => {
    expect(resolveCheckoutModel({ segment: "Curso online", checkout_type: "digital" })).toBe("loja");
  });

  it("mantém o checkout atual quando a loja não informou segmento", () => {
    // Sem segmento o sistema já assume alimentação; o checkout não pode mudar.
    expect(resolveCheckoutModel({})).toBe("delivery");
  });

  it("usa loja online como padrão seguro quando não há loja carregada", () => {
    expect(resolveCheckoutModel(null)).toBe("loja");
  });

  it("respeita a escolha do lojista quando compatível com o segmento", () => {
    expect(resolveCheckoutModel({ segment: "Hamburgueria", checkout_type: "loja" })).toBe("loja");
  });

  it("ignora escolha incompatível e volta para o modelo do segmento", () => {
    // Valores digitais antigos não podem reativar o checkout removido.
    expect(resolveCheckoutModel({ segment: "Barbearia", checkout_type: "digital" })).toBe("delivery");
    // Valor inválido salvo no banco não quebra a loja.
    expect(resolveCheckoutModel({ segment: "Hamburgueria", checkout_type: "xpto", accepts_delivery: true })).toBe(
      "delivery",
    );
  });

  it("oferece apenas modelos compatíveis ao lojista", () => {
    expect(allowedCheckoutModels({ segment: "Hamburgueria" })).toContain("agendamento");
    expect(allowedCheckoutModels({ segment: "Barbearia" })).not.toContain("digital");
    expect(allowedCheckoutModels({ segment: "Loja de roupas" })).not.toContain("agendamento");
  });

  it("aponta cada modelo para uma rota pública distinta", () => {
    const paths = Object.values(CHECKOUT_MODEL_PATH);
    expect(new Set(paths).size).toBe(paths.length);
    expect(CHECKOUT_MODEL_PATH.delivery).toBe("/checkout");
  });
});
