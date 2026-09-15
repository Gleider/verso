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
import {
  faixasLogaritmicas,
  indicesDaBanda,
  magnitudeEmDb,
  magnitudeParaEscalaDeAnalisador,
  normalizarParaExibicao,
} from "./bandas";

/** Espelha fftSize=1024 do AnalyserNode: sampleSize = numberOfSamples * 2. */
const AMOSTRAS = 256;
/** Igual a AnalyserNode.smoothingTimeConstant no player atual. */
const SUAVIZACAO_TEMPORAL = 0.65;
const BANDA_HZ: readonly [number, number] = [40, 330];

/**
 * Quantas barras o visualizador tem.
 *
 * 32 e o que cabe numa tela de 1920 com barra legivel, e o custo de memoria e
 * irrisorio: uma faixa de 3min30 a 30 fps da ~800 KB de Float32.
 */
export const N_BANDAS = 32;

/**
 * Constrói o envelope de batida, um valor de pulso (0..1) por quadro.
 *
 * `smoothing: false` em `visualizeAudio`: a suavização temporal é feita aqui,
 * à mão, como o `AnalyserNode` faz. Com o padrão (`true`) seriam três FFTs
 * por quadro em vez de uma.
 */
export type AnaliseDeAudio = {
  /** Pulso da batida por quadro, 0..1. */
  pulso: Float32Array;
  /**
   * Espectro por quadro, achatado: `bandas[quadro * N_BANDAS + faixa]`, 0..1.
   *
   * Achatado e nao array de arrays porque isto e lido a cada quadro pelo
   * visualizador — um `Float32Array` contiguo evita seis mil alocacoes.
   */
  bandas: Float32Array;
};

export function construirAnalise(
  dados: MediaUtilsAudioData,
  fps: number,
  duracaoMs: number,
): AnaliseDeAudio {
  const total = Math.max(1, Math.ceil((duracaoMs / 1000) * fps));
  const envelope = new Float32Array(total);
  const bandas = new Float32Array(total * N_BANDAS);
  const { de, ate } = indicesDaBanda(dados.sampleRate, AMOSTRAS, BANDA_HZ[0], BANDA_HZ[1]);
  // As faixas do visualizador saem da MESMA FFT do pulso: nenhuma analise a
  // mais por quadro, so outra leitura dos bins que ja foram calculados.
  const faixas = faixasLogaritmicas(dados.sampleRate, AMOSTRAS, N_BANDAS);

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

    for (let f = 0; f < N_BANDAS; f += 1) {
      const { de: fde, ate: fate } = faixas[f];
      let pico = 0;
      for (let bin = fde; bin <= fate; bin += 1) {
        // PICO, nao media: a media de uma faixa larga achata o transiente, e
        // um visualizador que nao salta no ataque parece desligado.
        const v = espectro[bin];
        if (v > pico) pico = v;
      }
      // Em dB e CRU aqui, sem passar pela escala do detector de batida: aquela
      // janela (-100 a -30 dB) satura em grave e médio, e o visualizador
      // ficava preso no teto em quase metade das faixas. A escala de exibição
      // é resolvida abaixo, olhando a música inteira.
      bandas[quadro * N_BANDAS + f] = magnitudeEmDb(pico);
    }
  }

  normalizarParaExibicao(bandas, N_BANDAS);

  return { pulso: envelope, bandas };
}
