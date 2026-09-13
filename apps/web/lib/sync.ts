/**
 * Sincronia entre o tempo do áudio e os versos da letra.
 *
 * Roda a cada quadro durante a reprodução, então a busca é binária: varrer a
 * lista 60 vezes por segundo desperdiça trabalho numa letra de centenas de
 * versos. Versos sem timing (importados e ainda não alinhados) são ignorados
 * em vez de quebrarem a busca.
 */

export interface TimedLine {
  start_ms: number | null;
  end_ms: number | null;
}

/**
 * Índice do verso que está tocando em `ms`, ou -1 antes do primeiro.
 *
 * Entre um verso e o próximo o anterior continua aceso — num intervalo
 * instrumental, deixar a tela sem destaque é pior que manter o último verso.
 */
export function activeLineIndex(lines: TimedLine[], ms: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let best = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;

    // O meio pode cair num verso sem timing; recua até o vizinho com timing.
    let probe = mid;
    while (probe >= lo && lines[probe].start_ms === null) probe -= 1;

    if (probe < lo) {
      lo = mid + 1; // só há versos sem timing nesta metade
      continue;
    }

    if ((lines[probe].start_ms as number) <= ms) {
      best = probe;
      lo = mid + 1;
    } else {
      hi = probe - 1;
    }
  }

  return best;
}

/** Quanto do verso já passou, de 0 a 1. Base do destaque por palavra na fase 2. */
export function lineProgress(line: TimedLine, ms: number): number {
  const start = line.start_ms;
  const end = line.end_ms;
  if (start === null || end === null || end <= start) return 0;
  if (ms <= start) return 0;
  if (ms >= end) return 1;
  return (ms - start) / (end - start);
}

/**
 * Quanto deslocar a lista para o verso ficar no meio da tela.
 *
 * `viewportHeight` é a altura da JANELA VISÍVEL, não a da lista de versos.
 * Usar a altura da lista produz um deslocamento enorme que tira tudo da tela.
 */
export function centerOffset(
  targetTop: number,
  targetHeight: number,
  viewportHeight: number,
): number {
  if (viewportHeight <= 0) return 0;
  return targetTop + targetHeight / 2 - viewportHeight / 2;
}

export interface TimedWord {
  s: number;
  e: number;
}

/** Onde o canto está dentro do verso: que palavra e quanto dela já passou. */
export interface WordCursor {
  /** Índice da palavra atual, ou -1 antes da primeira. */
  index: number;
  /** Fração já cantada dessa palavra, de 0 a 1. */
  fill: number;
}

/**
 * Localiza o canto dentro de um verso, para o destaque palavra a palavra.
 *
 * Roda a cada quadro, então a busca é binária. Num respiro entre palavras a
 * anterior permanece cheia — deixar o destaque voltar atrás faria a letra
 * piscar em cada pausa.
 */
export function wordCursor(words: TimedWord[], ms: number): WordCursor {
  if (words.length === 0 || ms < words[0].s) return { index: -1, fill: 0 };

  let lo = 0;
  let hi = words.length - 1;
  let index = 0;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].s <= ms) {
      index = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const { s, e } = words[index];
  if (e <= s || ms >= e) return { index, fill: 1 };
  return { index, fill: (ms - s) / (e - s) };
}
