/**
 * Tradução entre a escala do `visualizeAudio()` do Remotion e a escala do
 * `AnalyserNode` do navegador, que é contra a qual `lib/beat.ts` foi calibrado.
 *
 * As duas fontes de espectro NÃO são intercambiáveis. O `AnalyserNode` entrega
 * bytes 0–255 numa escala de DECIBÉIS (`255·(dB − minDecibels)/(maxDecibels −
 * minDecibels)`, padrões −100/−30 dB). O `visualizeAudio()` entrega magnitude
 * LINEAR normalizada pelo máximo do arquivo. As constantes de `lib/beat.ts`
 * (`MIN_ENERGY = 0.06`, `THRESHOLD = 1.35`) foram calibradas contra a
 * primeira escala; na segunda, a energia média de uma música fica na ordem de
 * 10⁻³ — sempre abaixo de `MIN_ENERGY`, e o pulso da batida nunca dispara.
 * Falha calada: o vídeo sai sem pulso e nada indica erro.
 */

/** Bins que cobrem [minHz, maxHz]. O bin tem sampleRate/(2·amostras) Hz. */
export function indicesDaBanda(
  sampleRate: number,
  amostras: number,
  minHz: number,
  maxHz: number,
): { de: number; ate: number } {
  const larguraDoBin = sampleRate / (2 * amostras);
  return {
    de: Math.max(1, Math.ceil(minHz / larguraDoBin)),
    ate: Math.min(amostras - 1, Math.floor(maxHz / larguraDoBin)),
  };
}

const MIN_DB = -100;
const MAX_DB = -30;

/** Magnitude linear (0..1, normalizada) -> a escala 0..1 do AnalyserNode. */
export function magnitudeParaEscalaDeAnalisador(magnitude: number): number {
  const db = 20 * Math.log10(Math.max(magnitude, 1e-10));
  return Math.min(1, Math.max(0, (db - MIN_DB) / (MAX_DB - MIN_DB)));
}
