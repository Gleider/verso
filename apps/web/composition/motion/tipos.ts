/**
 * O contrato dos nove modos de movimento.
 *
 * As duas funções são PURAS: mesma entrada, mesma saída, sempre. O Remotion
 * renderiza quadros fora de ordem e em processos paralelos — qualquer estado
 * acumulado ou `Math.random` produziria vídeo inconsistente.
 */
import type { MotionId, TweakId } from "../settings";

export type { MotionId, TweakId };

/** O que todo modo sabe sobre o verso neste quadro. */
export type EntradaDeVerso = {
  /** Tempo desde o início do verso, em ms. NEGATIVO antes da entrada. */
  msNoVerso: number;
  /** Duração do verso, em ms. Sempre > 0 (o chamador garante um mínimo). */
  duracaoMs: number;
  /** Duração da animação de entrada, em ms — settings.motion.durationMs. */
  entradaMs: number;
  /** Tempo absoluto do vídeo, em ms. Só o `floating` depende disto. */
  msAbsoluto: number;
  /** Pulso da batida neste quadro, de 0 a 1. */
  pulso: number;
  /** Ajuste contínuo sobreposto ao modo. */
  tweak: TweakId;
  /** Índice do verso na letra. Dá fase própria ao floating e ao bubbling. */
  indiceDoVerso: number;
};

/** O que um modo sabe sobre um segmento (sílaba ou palavra) do verso. */
export type EntradaDeSegmento = EntradaDeVerso & {
  /** Posição deste segmento no verso, de 0 a total-1. */
  indice: number;
  total: number;
  /** Índice do segmento sendo cantado agora; -1 antes do primeiro. */
  indiceAtual: number;
  /** Fração já cantada do segmento atual, de 0 a 1. */
  preenchimento: number;
};

export type EstiloDeVerso = {
  opacity: number;
  /** Pronto para o style. "none" quando o modo não transforma nada. */
  transform: string;
  /** null quando o modo não usa máscara. */
  clipPath: string | null;
  /** true no modo `mask`: o texto recorta a imagem em vez de ter cor. */
  recorta: boolean;
};

export type EstiloDeSegmento = {
  /** 0 = por cantar, 1 = cantado. Parcial só no segmento atual. */
  preenchimento: number;
  opacity: number;
  transform: string;
};

export type ModoDeMovimento = {
  id: MotionId;
  rotulo: string;
  verso(entrada: EntradaDeVerso): EstiloDeVerso;
  segmento(entrada: EntradaDeSegmento): EstiloDeSegmento;
};
