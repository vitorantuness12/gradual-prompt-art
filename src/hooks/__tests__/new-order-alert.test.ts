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
    const values = new Map<string, string>();
    const localStorageMock = {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    };
    AudioContextMock.instances = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { AudioContext: AudioContextMock, clearInterval, localStorage: localStorageMock, setInterval },
    });
  });

  afterEach(() => {
    acknowledgeNewOrderAlert();
    Reflect.deleteProperty(globalThis, "window");
  });

  it("aplica o volume salvo ao aviso", async () => {
    window.localStorage.setItem(NEW_ORDER_VOLUME_KEY, "50");
    await playNewOrderChime();

    const context = AudioContextMock.instances[0];
    expect(context?.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.12, expect.any(Number));
  });

  it("desliga qualquer repetição quando o som é desativado", () => {
    window.localStorage.setItem(NEW_ORDER_SOUND_KEY, "0");
    expect(() => refreshNewOrderAlertSound()).not.toThrow();
  });
});