import { describe, expect, it } from "vitest";

import { matchesCampaignAudience, nextRecurringRun } from "@/lib/push.server";

const baseCampaign = {
  id: "campaign",
  store_id: "store",
  title: "Título",
  body: "Mensagem",
  audience_type: "all",
  audience_config: {},
  schedule_type: "scheduled",
  recurrence: {},
  frequency_cap_hours: 24,
  next_run_at: null,
};

const customer = {
  id: "customer",
  birth_date: "1990-09-17",
  created_at: "2026-09-01T12:00:00.000Z",
  marketing_opt_in: true,
};

describe("push campaign targeting", () => {
  it("calcula a próxima recorrência sem repetir o instante atual", () => {
    expect(
      nextRecurringRun({ days: [4], time: "10:00" }, new Date("2026-09-17T10:00:00.000Z")),
    ).toBe("2026-09-24T10:00:00.000Z");
  });

  it("seleciona clientes recorrentes com dois pedidos", () => {
    expect(
      matchesCampaignAudience(
        { ...baseCampaign, audience_type: "recurring" },
        customer,
        [
          { customer_id: "customer", created_at: "2026-09-16T12:00:00.000Z" },
          { customer_id: "customer", created_at: "2026-09-10T12:00:00.000Z" },
        ],
        new Set(),
        new Date("2026-09-17T12:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("respeita o período configurado para clientes inativos", () => {
    expect(
      matchesCampaignAudience(
        { ...baseCampaign, audience_type: "inactive", audience_config: { inactiveDays: 60 } },
        customer,
        [{ customer_id: "customer", created_at: "2026-06-01T12:00:00.000Z" }],
        new Set(),
        new Date("2026-09-17T12:00:00.000Z"),
      ),
    ).toBe(true);
  });
});
