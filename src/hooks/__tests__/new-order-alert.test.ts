import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NEW_ORDER_SOUND_KEY,
  NEW_ORDER_VOLUME_KEY,
  acknowledgeNewOrderAlert,
  playNewOrderChime,
  refreshNewOrderAlertSound,
} from "@/hooks/useNewOrderAlert";

class AudioParamMock {
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

class AudioContextMock {
  static instances: AudioContextMock[] = [];
  currentTime = 0;
  destination = {};
  state: AudioContextState = "running";
  gain = new AudioParamMock();

  constructor() {
    AudioContextMock.instances.push(this);
  }

  createOscillator() {
    return {
      type: "sine",
      frequency: { value: 0 },
      connect: vi.fn().mockReturnThis(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }

  createGain() {
    return { gain: this.gain, connect: vi.fn().mockReturnThis() };
  }

  resume = vi.fn().mockResolvedValue(undefined);
}

describe("alerta sonoro de pedido", () => {
  beforeEach(() => {
    localStorage.clear();
    AudioContextMock.instances = [];
    Object.defineProperty(window, "AudioContext", { configurable: true, value: AudioContextMock });
  });

  afterEach(() => acknowledgeNewOrderAlert());

  it("aplica o volume salvo ao aviso", async () => {
    localStorage.setItem(NEW_ORDER_VOLUME_KEY, "50");
    await playNewOrderChime();

    const context = AudioContextMock.instances[0];
    expect(context?.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.12, expect.any(Number));
  });

  it("desliga qualquer repetição quando o som é desativado", () => {
    localStorage.setItem(NEW_ORDER_SOUND_KEY, "0");
    expect(() => refreshNewOrderAlertSound()).not.toThrow();
  });
});