/**
 * Prepara os versos para a composição: offset, nudge e silabificação, uma
 * vez só, fora do laço de quadros.
 *
 * Convenção de deslocamento: desloca a LETRA (soma `nudge - offset` aos
 * tempos), não o relógio — é a convenção de `verso_video/frames.py:build_lines`
 * no backend Python. Dentro da composição só pode haver um relógio; ele é o
 * `useCurrentFrame()` do Remotion, e ninguém mais pode inventar outro.
 *
 * Import relativo de propósito: o bundler do Remotion ignora `paths` do
 * tsconfig, e um `@/lib/...` aqui compilaria no Next e quebraria só no
 * primeiro render.
 */
import { normalizeWords } from "../lib/normalize";
import { timeSyllables } from "../lib/syllables";
import type { LyricLine } from "../lib/types";

export type SegmentoPreparado = {
  texto: string;
  s: number;
  e: number;
};

export type VersoPreparado = {
  id: string;
  texto: string;
  /** Já com offset e nudge aplicados. */
  inicioMs: number;
  fimMs: number;
  /** Sílabas com tempo, de `timeSyllables`. Vazio quando a linha não tem `words`. */
  segmentos: SegmentoPreparado[];
  /** As mesmas sílabas agrupadas de volta em palavras — para settings.motion.sync = "word". */
  palavras: SegmentoPreparado[];
};

/**
 * Os segmentos na granularidade pedida por `settings.motion.sync`.
 *
 * `"line"` sintetiza um segmento único cobrindo o verso inteiro — é o que
 * faz o preenchimento avançar junto, sem quebra por palavra ou sílaba.
 */
export function segmentosNaGranularidade(
  verso: VersoPreparado,
  granularidade: "line" | "word" | "syllable",
): SegmentoPreparado[] {
  if (granularidade === "syllable") return verso.segmentos;
  if (granularidade === "word") return verso.palavras;
  return [{ texto: verso.texto, s: verso.inicioMs, e: verso.fimMs }];
}

/**
 * Aplica offset e nudge, normaliza os timings e silabifica.
 *
 * Linhas sem `start_ms` (letra ainda sem timing medido) são descartadas: não
 * há como posicioná-las no vídeo. O resultado sai ordenado por início.
 */
export function prepararVersos(
  lines: LyricLine[],
  offsetMs: number,
  lang = "pt",
): VersoPreparado[] {
  const out: VersoPreparado[] = [];

  for (const line of lines) {
    if (line.start_ms === null) continue;
    const shift = (line.nudge_ms ?? 0) - offsetMs;

    const segmentos: SegmentoPreparado[] = [];
    const palavras: SegmentoPreparado[] = [];
    const palavrasNormalizadas = normalizeWords(line.words);
    // O mesmo saneamento do player e do render Python: sem ele o destaque
    // arrasta sobre trechos em que ninguém está cantando.
    palavrasNormalizadas.forEach((word, indiceDaPalavra) => {
      const deslocada = { w: word.w, s: word.s + shift, e: word.e + shift };
      // Espaço anexado ao fim de cada palavra (exceto a última): concatenar
      // TODOS os segmentos da linha precisa reproduzir o texto com os
      // espaços no lugar certo — sem isto, renderizar por sílaba coladas as
      // palavras umas nas outras.
      const ultimaDaLinha = indiceDaPalavra === palavrasNormalizadas.length - 1;
      const espaco = ultimaDaLinha ? "" : " ";

      palavras.push({ texto: word.w + espaco, s: deslocada.s, e: deslocada.e });

      const silabas = timeSyllables(deslocada, lang);
      silabas.forEach((syllable, indiceDaSilaba) => {
        const ultimaDaPalavra = indiceDaSilaba === silabas.length - 1;
        segmentos.push({
          texto: syllable.text + (ultimaDaPalavra ? espaco : ""),
          s: syllable.s,
          e: syllable.e,
        });
      });
    });

    out.push({
      id: line.id,
      texto: line.text,
      inicioMs: line.start_ms + shift,
      fimMs: (line.end_ms ?? line.start_ms) + shift,
      segmentos,
      palavras,
    });
  }

  out.sort((a, b) => a.inicioMs - b.inicioMs);
  return out;
}

/** Índice do verso em exibição, ou -1 antes do primeiro. Busca binária. */
export function indiceDoVersoAtivo(versos: VersoPreparado[], ms: number): number {
  let low = 0;
  let high = versos.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (versos[mid].inicioMs <= ms) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}
