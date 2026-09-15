/**
 * Detecção de batida.
 *
 * Recorrência com estado: cada quadro depende do anterior. Quem constrói o
 * envelope inteiro, sempre do quadro 0 e em ordem, é
 * `composition/audio/envelope.ts` — o Remotion renderiza quadros fora de ordem
 * e em paralelo, e chamar isto direto num quadro qualquer daria outro valor
 * (`pitfalls.md` §17).
 *
 * As constantes abaixo estão calibradas para a escala de decibéis do
 * `AnalyserNode`. A tradução da magnitude linear do Remotion para essa escala
 * é feita antes, em `composition/audio/bandas.ts` — mudar os números daqui sem
 * mexer lá dessincroniza o pulso do vídeo exportado.
 *
 * O movimento contínuo da imagem morava aqui junto (`ambientScale`,
 * `ambientDrift`, `visualState`, do player anterior ao editor de vídeo) e hoje
 * vive em `composition/ambiente.ts`, que é quem o preview e o MP4 usam.
 */

export interface BeatState {
  /** Média móvel da energia grave — a referência do que é "normal" agora. */
  average: number;
  /** Intensidade do pulso, de 0 a 1. */
  pulse: number;
}

export const INITIAL_BEAT: BeatState = { average: 0, pulse: 0 };

/** Quão rápido a média acompanha a música. */
const SMOOTHING = 0.12;
/** Quanto a energia precisa passar da média para contar como batida. */
const THRESHOLD = 1.35;
/** Abaixo disto é silêncio: ruído de fundo não deve pulsar a imagem. */
const MIN_ENERGY = 0.06;
/** Queda do pulso a cada quadro, para a batida "soltar" sozinha. */
const DECAY = 0.86;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Avança um quadro da detecção de batida.
 *
 * Batida é energia acima do *habitual*, não energia alta: um trecho denso e
 * constante tem grave forte o tempo todo e não deve pulsar nada.
 */
export function stepBeat(state: BeatState, energy: number): BeatState {
  const average =
    state.average === 0 ? energy : state.average * (1 - SMOOTHING) + energy * SMOOTHING;

  let pulse = state.pulse * DECAY;

  if (energy > MIN_ENERGY && average > 0 && energy > average * THRESHOLD) {
    const excess = energy / average - 1;
    pulse = Math.max(pulse, clamp(excess, 0, 1));
  }

  return { average, pulse: clamp(pulse, 0, 1) };
}
