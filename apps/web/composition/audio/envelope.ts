/**
 * O pulso da batida, pré-computado para todos os quadros.
 *
 * `stepBeat` (`lib/beat.ts`) é uma RECORRÊNCIA com estado — a média móvel e o
 * decaimento do pulso dependem do quadro anterior. O Remotion renderiza
 * quadros fora de ordem e em processos paralelos: chamar `stepBeat` dentro do
 * componente, quadro a quadro, daria um pulso diferente a cada render. A
 * correção é construir o envelope inteiro de uma vez, sempre do quadro 0 em
 * ordem, e indexar nele durante o render — o cálculo cabe fora do laço de
 * quadros porque é puro e não depende de quando cada quadro é pedido.
 */
import { INITIAL_BEAT, stepBeat } from "../../lib/beat";
import type { MediaUtilsAudioData } from "@remotion/media-utils";
import { visualizeAudio } from "@remotion/media-utils";
import { indicesDaBanda, magnitudeParaEscalaDeAnalisador } from "./bandas";

/** Espelha fftSize=1024 do AnalyserNode: sampleSize = numberOfSamples * 2. */
const AMOSTRAS = 256;
/** Igual a AnalyserNode.smoothingTimeConstant no player atual. */
const SUAVIZACAO_TEMPORAL = 0.65;
const BANDA_HZ: readonly [number, number] = [40, 330];

/**
 * Constrói o envelope de batida, um valor de pulso (0..1) por quadro.
 *
 * `smoothing: false` em `visualizeAudio`: a suavização temporal é feita aqui,
 * à mão, como o `AnalyserNode` faz. Com o padrão (`true`) seriam três FFTs
 * por quadro em vez de uma.
 */
export function construirEnvelopeDeBatida(
  dados: MediaUtilsAudioData,
  fps: number,
  duracaoMs: number,
): Float32Array {
  const total = Math.max(1, Math.ceil((duracaoMs / 1000) * fps));
  const envelope = new Float32Array(total);
  const { de, ate } = indicesDaBanda(dados.sampleRate, AMOSTRAS, BANDA_HZ[0], BANDA_HZ[1]);

  let batida = INITIAL_BEAT;
  const suavizado = new Float64Array(AMOSTRAS);

  for (let quadro = 0; quadro < total; quadro += 1) {
    const espectro = visualizeAudio({
      audioData: dados,
      frame: quadro,
      fps,
      numberOfSamples: AMOSTRAS,
      smoothing: false,
      optimizeFor: "speed",
    });

    let soma = 0;
    for (let bin = de; bin <= ate; bin += 1) {
      suavizado[bin] =
        SUAVIZACAO_TEMPORAL * suavizado[bin] + (1 - SUAVIZACAO_TEMPORAL) * espectro[bin];
      soma += magnitudeParaEscalaDeAnalisador(suavizado[bin]);
    }

    batida = stepBeat(batida, soma / (ate - de + 1));
    envelope[quadro] = batida.pulse;
  }

  return envelope;
}
