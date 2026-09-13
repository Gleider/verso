/**
 * Efeitos da imagem de fundo.
 *
 * Cada efeito é uma função pura de (tempo, batida) para um punhado de valores
 * de estilo. O componente apenas aplica o que vem — nenhuma lógica de efeito
 * mora no React, e o custo por quadro continua sendo escrita de estilo.
 */

import { visualState } from "./beat";

export type EffectId = "breathe" | "vhs" | "pulse" | "none";

export interface EffectDefinition {
  id: EffectId;
  label: string;
  description: string;
}

export const EFFECTS: EffectDefinition[] = [
  {
    id: "breathe",
    label: "Respiração",
    description: "Zoom lento e deriva suave, com um pulso na batida.",
  },
  {
    id: "vhs",
    label: "VHS",
    description: "Linhas de varredura, ruído, cor separada e falha de rastreamento.",
  },
  {
    id: "pulse",
    label: "Pulso",
    description: "Parada no lugar; só reage à batida da música.",
  },
  {
    id: "none",
    label: "Nenhum",
    description: "Imagem estática, sem movimento nem alteração de cor.",
  },
];

export const DEFAULT_EFFECT: EffectId = "breathe";

const IDS = new Set<string>(EFFECTS.map((effect) => effect.id));

export function isEffectId(value: unknown): value is EffectId {
  return typeof value === "string" && IDS.has(value);
}

/** Faixa horizontal deslocada, como fita com rastreamento ruim. */
export interface TrackingGlitch {
  /** Topo da faixa, em porcentagem da altura. */
  y: number;
  /** Altura da faixa, em porcentagem. */
  height: number;
  /** Deslocamento lateral da faixa, em porcentagem da largura. */
  shift: number;
}

export interface EffectFrame {
  transform: string;
  filter: string;
  /** Opacidade do overlay de linhas de varredura, de 0 a 1. */
  scanlines: number;
  /** Opacidade do overlay de ruído, de 0 a 1. */
  noise: number;
  /** Cópia deslocada da imagem, para separar as cores. */
  chroma: { transform: string; opacity: number } | null;
  /** Tremor vertical, em porcentagem da altura. */
  jitterY: number;
  tracking: TrackingGlitch | null;
}

/**
 * Ruído determinístico: mesma entrada, mesma saída.
 *
 * Determinismo importa aqui — com `Math.random` o efeito seria impossível de
 * testar, e dois quadros seguidos poderiam saltar de forma incoerente.
 */
function hash(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// --- VHS -------------------------------------------------------------------
/** O tremor troca ~14 vezes por segundo: rápido o bastante para parecer fita. */
const JITTER_BLOCK_MS = 70;
/** A falha de rastreamento é sorteada por janela, e dura pouco dentro dela. */
const TRACKING_WINDOW_MS = 2600;
const TRACKING_HEIGHT = 6;

/**
 * Cada característica do VHS vai de discreta (intensidade 0) a marcante (1).
 *
 * Os pares estão aqui em cima para a calibragem ser uma leitura só: à esquerda
 * o quase-imperceptível, à direita o assumidamente estilizado.
 */
const VHS = {
  scanlines: [0.05, 0.45],
  noise: [0.015, 0.2],
  noiseFlicker: [0.01, 0.06],
  chromaOpacity: [0.1, 0.62],
  chromaShift: [0.08, 1.1],
  jitter: [0.25, 2.5],
  jitterX: [0.05, 0.6],
  scale: [1.015, 1.06],
  saturate: [1.06, 1.55],
  contrast: [1.03, 1.32],
  /** Limiar do sorteio: quanto MENOR, mais vezes a falha aparece. */
  trackingChance: [0.92, 0.45],
  trackingDuration: [250, 600],
  trackingShift: [1.5, 9],
} as const;

const lerp = ([from, to]: readonly [number, number], t: number) => from + (to - from) * t;

function vhsFrame(ms: number, pulse: number, intensity: number): EffectFrame {
  const block = Math.floor(ms / JITTER_BLOCK_MS);
  const jitterY = (hash(block) - 0.5) * lerp(VHS.jitter, intensity);
  const jitterX = (hash(block * 1.7) - 0.5) * lerp(VHS.jitterX, intensity);

  // A imagem fica ampliada o bastante para o tremor não revelar as bordas.
  const scale = lerp(VHS.scale, intensity) + pulse * 0.02 * intensity;

  const window = Math.floor(ms / TRACKING_WINDOW_MS);
  const intoWindow = ms % TRACKING_WINDOW_MS;
  const tracking =
    hash(window * 7.3) > lerp(VHS.trackingChance, intensity) &&
    intoWindow < lerp(VHS.trackingDuration, intensity)
      ? {
          y: hash(window * 3.1) * (100 - TRACKING_HEIGHT),
          height: TRACKING_HEIGHT,
          shift: (hash(window * 5.9) - 0.5) * lerp(VHS.trackingShift, intensity),
        }
      : null;

  const saturate = lerp(VHS.saturate, intensity) + pulse * 0.2 * intensity;
  const contrast = lerp(VHS.contrast, intensity) + pulse * 0.08 * intensity;
  const brightness = 1 + (0.02 + pulse * 0.12) * intensity;
  const chromaShift = lerp(VHS.chromaShift, intensity);

  return {
    transform: `translate3d(${jitterX.toFixed(3)}%, ${jitterY.toFixed(3)}%, 0) scale(${scale.toFixed(4)})`,
    // Fita gasta: cor puxada, contraste duro e um leve estouro de brilho.
    filter: `saturate(${saturate.toFixed(3)}) contrast(${contrast.toFixed(3)}) brightness(${brightness.toFixed(3)})`,
    scanlines: lerp(VHS.scanlines, intensity),
    noise: lerp(VHS.noise, intensity) + hash(block * 2.3) * lerp(VHS.noiseFlicker, intensity),
    chroma: {
      // Deslocada em sentido contrário à imagem, para as cores se separarem.
      transform: `translate3d(${(-jitterX - chromaShift).toFixed(3)}%, ${(-jitterY * 0.4).toFixed(3)}%, 0) scale(${scale.toFixed(4)})`,
      opacity: lerp(VHS.chromaOpacity, intensity),
    },
    jitterY,
    tracking,
  };
}

// --- demais efeitos --------------------------------------------------------

function breatheFrame(ms: number, pulse: number, intensity: number): EffectFrame {
  const { scale, brightness, saturate, x, y } = visualState(ms, pulse);
  // A intensidade encolhe o desvio em relação ao repouso: em 0 a imagem fica
  // parada, em 1 o efeito vale inteiro.
  const s = 1 + (scale - 1) * intensity;
  const b = 1 + (brightness - 1) * intensity;
  const sat = 1 + (saturate - 1) * intensity;
  return {
    transform: `translate3d(${(x * intensity).toFixed(3)}%, ${(y * intensity).toFixed(3)}%, 0) scale(${s.toFixed(4)})`,
    filter: `brightness(${b.toFixed(3)}) saturate(${sat.toFixed(3)})`,
    scanlines: 0,
    noise: 0,
    chroma: null,
    jitterY: 0,
    tracking: null,
  };
}

function pulseFrame(_ms: number, pulse: number, intensity: number): EffectFrame {
  // Sem termo dependente do tempo: parada, até a música mandar.
  const scale = 1 + (0.02 + pulse * 0.05) * intensity;
  return {
    transform: `translate3d(0%, 0%, 0) scale(${scale.toFixed(4)})`,
    filter: `brightness(${(1 + pulse * 0.2 * intensity).toFixed(3)}) saturate(${(1 + pulse * 0.26 * intensity).toFixed(3)})`,
    scanlines: 0,
    noise: 0,
    chroma: null,
    jitterY: 0,
    tracking: null,
  };
}

const STILL: EffectFrame = {
  transform: "scale(1)",
  filter: "none",
  scanlines: 0,
  noise: 0,
  chroma: null,
  jitterY: 0,
  tracking: null,
};

export const DEFAULT_INTENSITY = 0.55;

/**
 * Estado visual da imagem neste instante.
 *
 * `intensity` vai de 0 (quase imperceptível) a 1 (assumidamente estilizado) e
 * vale para qualquer efeito — é o mesmo controle na interface.
 */
export function effectFrame(
  effect: string,
  elapsedMs: number,
  pulse: number,
  intensity = 1,
): EffectFrame {
  const strength = Math.min(1, Math.max(0, intensity));

  switch (effect) {
    case "vhs":
      return vhsFrame(elapsedMs, pulse, strength);
    case "pulse":
      return pulseFrame(elapsedMs, pulse, strength);
    case "none":
      return STILL;
    case "breathe":
      return breatheFrame(elapsedMs, pulse, strength);
    default:
      // Valor desconhecido (dado antigo ou corrompido) não pode quebrar o player.
      return effectFrame(DEFAULT_EFFECT, elapsedMs, pulse, strength);
  }
}
