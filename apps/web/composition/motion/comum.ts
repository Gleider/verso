import { hash } from "../textures/comum";
import type { EntradaDeSegmento, EntradaDeVerso, EstiloDeSegmento, EstiloDeVerso } from "./tipos";

/** Estado de repouso: nenhuma transformação, nenhuma máscara. */
export const VERSO_PARADO: EstiloDeVerso = {
  opacity: 1,
  transform: "none",
  clipPath: null,
  recorta: false,
};

const clamp = (valor: number, min: number, max: number) => Math.min(max, Math.max(min, valor));

/** 0 a 1, com aceleração de entrada suave (ease-out cúbico). */
export function progressoDeEntrada(entrada: EntradaDeVerso): number {
  const t = clamp(entrada.msNoVerso / Math.max(1, entrada.entradaMs), 0, 1);
  return 1 - (1 - t) ** 3;
}

const DERIVA_AMPLITUDE_PX = 7;
const DERIVA_PERIODO_MS = 4200;

/**
 * A deriva lenta do `tweak: "floating"`, um seno de `msAbsoluto` com fase por
 * `indiceDoVerso` — sem isso todo verso derivaria em uníssono, o que parece
 * mecânico em vez de orgânico.
 */
export function derivaFlutuante(entrada: EntradaDeVerso): string {
  if (entrada.tweak !== "floating") return "none";
  const fase = hash(entrada.indiceDoVerso * 3.7) * Math.PI * 2;
  const y = Math.sin((2 * Math.PI * entrada.msAbsoluto) / DERIVA_PERIODO_MS + fase);
  return `translateY(${(y * DERIVA_AMPLITUDE_PX).toFixed(2)}px)`;
}

/** Combina a transform do modo com a deriva do tweak, quando houver as duas. */
export function combinarTransform(doModo: string, doTweak: string): string {
  if (doModo === "none") return doTweak;
  if (doTweak === "none") return doModo;
  return `${doModo} ${doTweak}`;
}

/**
 * O preenchimento silábico padrão: sílaba concluída fica cheia, a atual
 * interpola, as seguintes ficam vazias. É a mesma regra de `preenchimento.ts`,
 * por segmento em vez de para o verso inteiro — a maioria dos modos usa
 * exatamente isto; só `bubbling` e `mask` se desviam.
 */
export function preenchimentoPadrao({
  indice,
  indiceAtual,
  preenchimento,
}: EntradaDeSegmento): EstiloDeSegmento {
  const cheio = indice < indiceAtual ? 1 : indice === indiceAtual ? preenchimento : 0;
  return { preenchimento: cheio, opacity: 1, transform: "none" };
}
