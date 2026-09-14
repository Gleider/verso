/**
 * Em que ponto do verso o canto está, para alimentar `EntradaDeSegmento`.
 *
 * Mesma estrutura de `verso_video/frames.py:_fill_position` (o Pillow que
 * este projeto substitui): percorre os segmentos em ordem e para no primeiro
 * que ainda não terminou, interpolando por tempo decorrido nele.
 */
import type { SegmentoPreparado } from "./versos";

export type PosicaoNoVerso = {
  /** Índice do segmento sendo cantado agora; -1 antes do primeiro. */
  indiceAtual: number;
  /** Fração já cantada do segmento atual, de 0 a 1. Só importa se indiceAtual >= 0. */
  preenchimento: number;
};

/**
 * Posição no verso, na granularidade dos segmentos passados (sílaba, palavra
 * ou o verso inteiro como um segmento só — ver `segmentosNaGranularidade`).
 *
 * Quando `ms` já passou do fim do último segmento, `indiceAtual` sai igual a
 * `segmentos.length` — maior que qualquer índice real, o que faz
 * `indice < indiceAtual` valer para todos e o verso aparecer todo cantado.
 */
export function posicaoNoVerso(segmentos: SegmentoPreparado[], ms: number): PosicaoNoVerso {
  if (segmentos.length === 0 || ms < segmentos[0].s) {
    return { indiceAtual: -1, preenchimento: 0 };
  }

  for (let indice = 0; indice < segmentos.length; indice += 1) {
    const segmento = segmentos[indice];
    if (ms < segmento.e) {
      const duracao = Math.max(1, segmento.e - segmento.s);
      const fracao = (ms - segmento.s) / duracao;
      return { indiceAtual: indice, preenchimento: Math.min(1, Math.max(0, fracao)) };
    }
  }

  return { indiceAtual: segmentos.length, preenchimento: 0 };
}
