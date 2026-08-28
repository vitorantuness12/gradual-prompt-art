/**
 * Regras puras de operação em tempo real: tempo de preparo dinâmico
 * conforme a fila e presets de pausa rápida de pedidos.
 */

export interface EtaInput {
  /** Tempo base de preparo em minutos (configurado pela loja). */
  baseMinutes: number;
  /** Pedidos em preparo/aguardando agora. */
  activeOrders: number;
  /** Quantos pedidos a cozinha dá conta por rodada. */
  capacity: number;
  /** Minutos extras para entrega (0 para retirada/mesa). */
  deliveryMinutes?: number;
}

export interface EtaResult {
  /** Minutos mínimos estimados. */
  min: number;
  /** Minutos máximos estimados. */
  max: number;
  /** Rótulo pronto para exibir ao cliente. */
  label: string;
  /** Nível de carga da cozinha. */
  load: "tranquilo" | "movimentado" | "lotado";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Calcula o prazo estimado somando rodadas de preparo conforme a fila atual. */
export function computeDynamicEta(input: EtaInput): EtaResult {
  const base = clamp(Math.round(input.baseMinutes || 20), 5, 180);
  const capacity = Math.max(1, Math.round(input.capacity || 6));
  const active = Math.max(0, Math.round(input.activeOrders || 0));
  const delivery = Math.max(0, Math.round(input.deliveryMinutes ?? 0));

  const waves = Math.max(1, Math.ceil((active + 1) / capacity));
  const queueExtra = (waves - 1) * Math.round(base * 0.6);
  const min = clamp(base + queueExtra + delivery, 5, 240);
  const max = clamp(min + Math.max(10, Math.round(base * 0.4)), min + 5, 300);

  const ratio = active / capacity;
  const load: EtaResult["load"] = ratio >= 2 ? "lotado" : ratio >= 1 ? "movimentado" : "tranquilo";

  return { min, max, label: `${min} a ${max} min`, load };
}

export const PAUSE_PRESETS = [
  { minutes: 15, label: "15 minutos" },
  { minutes: 20, label: "20 minutos" },
  { minutes: 30, label: "30 minutos" },
  { minutes: 60, label: "1 hora" },
] as const;

/** Texto curto do estado de pausa para cabeçalhos do painel, PDV e KDS. */
export function pauseStatusLabel(status: string | null | undefined, pausedUntil: string | null | undefined): string {
  if (status !== "paused") return "Recebendo pedidos";
  if (!pausedUntil) return "Pedidos pausados";
  const until = new Date(pausedUntil);
  if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) return "Recebendo pedidos";
  return `Pausado até ${until.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Continua pausada? Usa a data limite para reabrir sozinha. */
export function isPauseActive(status: string | null | undefined, pausedUntil: string | null | undefined): boolean {
  if (status !== "paused") return false;
  if (!pausedUntil) return true;
  const until = new Date(pausedUntil);
  return Number.isNaN(until.getTime()) ? true : until.getTime() > Date.now();
}
