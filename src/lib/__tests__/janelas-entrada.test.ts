import { describe, expect, it } from "vitest";

import {
  MemoryStorage,
  defaultEntryPopupConfig,
  evaluatePopup,
  isPopupHiddenForever,
  markPopupHidden,
  markPopupShown,
  parseEntryPopupConfig,
  planEntryPopups,
  withinSchedule,
  type EntryPopupConfig,
} from "@/lib/entry-popups";

function ctx(overrides: Partial<Parameters<typeof evaluatePopup>[0]> = {}) {
  return {
    slug: "loja",
    kind: "repeat" as const,
    config: { ...defaultEntryPopupConfig("repeat"), enabled: true },
    version: 1,
    now: new Date("2026-08-26T15:00:00"),
    device: "desktop" as const,
    hasActiveCampaign: false,
    local: new MemoryStorage(),
    session: new MemoryStorage(),
    ...overrides,
  };
}

describe("janelas de entrada — elegibilidade", () => {
  it("não abre janela desativada", () => {
    const config: EntryPopupConfig = { ...defaultEntryPopupConfig("repeat"), enabled: false };
    expect(evaluatePopup(ctx({ config })).reason).toBe("disabled");
  });

  it("abre janela ativa com frequência por sessão", () => {
    expect(evaluatePopup(ctx()).eligible).toBe(true);
  });

  it("respeita o dispositivo escolhido", () => {
    const config = { ...defaultEntryPopupConfig("repeat"), enabled: true, device: "mobile" as const };
    expect(evaluatePopup(ctx({ config, device: "desktop" })).reason).toBe("device");
    expect(evaluatePopup(ctx({ config, device: "mobile" })).eligible).toBe(true);
  });

  it("não abre fora do horário configurado", () => {
    const config = {
      ...defaultEntryPopupConfig("repeat"),
      enabled: true,
      startTime: "18:00",
      endTime: "23:00",
    };
    expect(evaluatePopup(ctx({ config })).reason).toBe("schedule");
    expect(evaluatePopup(ctx({ config, now: new Date("2026-08-26T19:00:00") })).eligible).toBe(true);
  });

  it("aceita janela de horário que vira o dia", () => {
    const config = { ...defaultEntryPopupConfig("repeat"), startTime: "22:00", endTime: "02:00" };
    expect(withinSchedule(config, new Date("2026-08-26T23:30:00"))).toBe(true);
    expect(withinSchedule(config, new Date("2026-08-26T01:00:00"))).toBe(true);
    expect(withinSchedule(config, new Date("2026-08-26T12:00:00"))).toBe(false);
  });

  it("não abre em dia fora da lista", () => {
    const config = { ...defaultEntryPopupConfig("repeat"), enabled: true, daysOfWeek: [0, 6] };
    expect(evaluatePopup(ctx({ config })).reason).toBe("schedule");
  });

  it("não repete na mesma sessão", () => {
    const session = new MemoryStorage();
    const local = new MemoryStorage();
    const base = ctx({ session, local });
    expect(evaluatePopup(base).eligible).toBe(true);
    markPopupShown("loja", "repeat", base.config, base.now, local, session);
    expect(evaluatePopup(base).reason).toBe("frequency");
  });

  it("respeita o intervalo mínimo entre exibições", () => {
    const local = new MemoryStorage();
    const config = {
      ...defaultEntryPopupConfig("repeat"),
      enabled: true,
      frequency: "first_visit" as const,
      minIntervalMinutes: 60,
    };
    const now = new Date("2026-08-26T15:00:00");
    local.setItem("osp:popup:ultima:loja:repeat", String(now.getTime() - 10 * 60_000));
    expect(evaluatePopup(ctx({ config, local, now })).reason).toBe("min_interval");
  });

  it("não mostrar novamente vale até uma nova versão publicada", () => {
    const local = new MemoryStorage();
    markPopupHidden("loja", "repeat", 1, local);
    expect(isPopupHiddenForever("loja", "repeat", 1, local)).toBe(true);
    expect(evaluatePopup(ctx({ local })).reason).toBe("hidden_forever");
    // Nova publicação libera a exibição outra vez.
    expect(isPopupHiddenForever("loja", "repeat", 2, local)).toBe(false);
    expect(evaluatePopup(ctx({ local, version: 2 })).eligible).toBe(true);
  });

  it("modo somente manual nunca abre sozinho", () => {
    const config = { ...defaultEntryPopupConfig("repeat"), enabled: true, displayMode: "manual" as const };
    expect(evaluatePopup(ctx({ config })).reason).toBe("no_auto");
  });

  it("frequência de campanha exige campanha ativa", () => {
    const config = { ...defaultEntryPopupConfig("highlights"), enabled: true, frequency: "campaign" as const };
    expect(evaluatePopup(ctx({ kind: "highlights", config, hasActiveCampaign: false })).reason).toBe("no_campaign");
    expect(evaluatePopup(ctx({ kind: "highlights", config, hasActiveCampaign: true })).eligible).toBe(true);
  });
});

describe("janelas de entrada — prioridade", () => {
  it("ordena pela prioridade escolhida pelo lojista", () => {
    const repeat = { ...defaultEntryPopupConfig("repeat"), enabled: true, priority: 2 };
    const highlights = { ...defaultEntryPopupConfig("highlights"), enabled: true, priority: 1 };
    const plan = planEntryPopups(
      [
        { kind: "repeat", config: repeat, version: 1 },
        { kind: "highlights", config: highlights, version: 1 },
      ],
      {
        slug: "loja",
        now: new Date("2026-08-26T15:00:00"),
        device: "desktop",
        hasActiveCampaign: true,
        local: new MemoryStorage(),
        session: new MemoryStorage(),
      },
    );
    expect(plan.map((item) => item.kind)).toEqual(["highlights", "repeat"]);
  });

  it("deixa o plano vazio quando as duas estão desativadas", () => {
    const plan = planEntryPopups(
      [
        { kind: "repeat", config: defaultEntryPopupConfig("repeat"), version: 1 },
        { kind: "highlights", config: defaultEntryPopupConfig("highlights"), version: 1 },
      ],
      {
        slug: "loja",
        now: new Date(),
        device: "mobile",
        hasActiveCampaign: false,
        local: new MemoryStorage(),
        session: new MemoryStorage(),
      },
    );
    expect(plan).toEqual([]);
  });
});

describe("janelas de entrada — leitura da configuração", () => {
  it("volta ao padrão quando o valor salvo é inválido", () => {
    const config = parseEntryPopupConfig("repeat", { frequency: "qualquer", device: 9, priority: 7 });
    expect(config.frequency).toBe("session");
    expect(config.device).toBe("all");
    expect(config.priority).toBe(1);
  });

  it("mantém os textos personalizados do lojista", () => {
    const config = parseEntryPopupConfig("repeat", { enabled: true, content: { title: "Bora repetir?" } });
    expect(config.enabled).toBe(true);
    expect((config.content as { title: string }).title).toBe("Bora repetir?");
  });
});
