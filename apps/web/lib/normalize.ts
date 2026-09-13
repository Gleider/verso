/**
 * Saneamento dos timings de palavra antes de virarem destaque.
 *
 * O Whisper não mede o áudio: os tempos são derivados dos pesos de atenção do
 * modelo, e trazem defeitos característicos. O pior deles para o karaokê é a
 * duração inflada — a última palavra de um trecho absorve o silêncio que vem
 * depois, e o preenchimento arrasta por segundos sobre um trecho em que
 * ninguém está cantando.
 *
 * Aqui as durações implausíveis são cortadas, sobreposições desfeitas e a
 * ordem garantida. Silêncio real entre palavras é preservado: a correção é
 * sobre duração, não sobre posição.
 */

import type { WordTiming } from "./types";

/**
 * Duração plausível de uma palavra cantada, pelo tamanho dela.
 *
 * Os números vêm da ordem de grandeza do canto: sílabas em torno de 200 ms,
 * com folga para sustentação. O piso existe para monossílabos segurados
 * ("eeeeu"), e o teto para nenhuma palavra virar um verso inteiro.
 */
const MS_PER_CHAR = 180;
const BASE_MS = 350;
const MIN_PLAUSIBLE_MS = 700;
const MAX_PLAUSIBLE_MS = 2000;

function plausibleDuration(text: string): number {
  const estimate = text.length * MS_PER_CHAR + BASE_MS;
  return Math.min(MAX_PLAUSIBLE_MS, Math.max(MIN_PLAUSIBLE_MS, estimate));
}

/** Devolve os timings em ordem, sem sobreposição e sem duração absurda. */
export function normalizeWords(words: WordTiming[]): WordTiming[] {
  if (words.length === 0) return [];

  const ordered = [...words].sort((a, b) => a.s - b.s);

  const clamped = ordered.map((word) => {
    const start = word.s;
    // Fim antes do início é dado corrompido; colapsa em duração zero.
    const end = Math.max(start, word.e);
    const limit = plausibleDuration(word.w);
    return { ...word, s: start, e: Math.min(end, start + limit) };
  });

  // Uma palavra nunca invade a seguinte: o destaque saltaria para trás.
  for (let i = 0; i < clamped.length - 1; i += 1) {
    if (clamped[i].e > clamped[i + 1].s) {
      clamped[i].e = clamped[i + 1].s;
    }
  }

  return clamped;
}
