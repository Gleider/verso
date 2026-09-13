/**
 * Imagem de fundo viva.
 *
 * Dois movimentos somados: uma respiração lenta e contínua, que dá vida mesmo
 * num trecho instrumental, e um micro-pulso na batida, que amarra a imagem à
 * música. As amplitudes são pequenas de propósito — o efeito deve ser sentido,
 * não notado, e a foto do usuário não pode virar outra coisa.
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

/**
 * Respiração ambiente.
 *
 * O zoom nunca cai abaixo de AMBIENT_BASE: o deslocamento lateral precisa de
 * margem para não revelar a borda da imagem.
 */
const AMBIENT_PERIOD_MS = 18_000;
const AMBIENT_BASE = 1.05;
const AMBIENT_AMPLITUDE = 0.12;

/**
 * Deslocamento lento, em porcentagem do quadro.
 *
 * Os dois eixos usam períodos diferentes de propósito: com períodos iguais o
 * movimento vira uma diagonal óbvia; diferentes, ele parece orgânico.
 */
const DRIFT_X = 1.8;
const DRIFT_Y = 1.2;
const DRIFT_PERIOD_X_MS = 23_000;
const DRIFT_PERIOD_Y_MS = 31_000;

/** O quanto a batida mexe em cada propriedade. */
const PULSE_SCALE = 0.035;
const PULSE_BRIGHTNESS = 0.18;
const PULSE_SATURATE = 0.22;

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

/** Respiração lenta da imagem, independente da música. */
export function ambientScale(elapsedMs: number): number {
  const phase = (2 * Math.PI * elapsedMs) / AMBIENT_PERIOD_MS;
  return AMBIENT_BASE + (AMBIENT_AMPLITUDE * (1 - Math.cos(phase))) / 2;
}

/** Deslocamento lento da imagem, em porcentagem do quadro. */
export function ambientDrift(elapsedMs: number): { x: number; y: number } {
  return {
    x: DRIFT_X * Math.sin((2 * Math.PI * elapsedMs) / DRIFT_PERIOD_X_MS),
    y: DRIFT_Y * Math.sin((2 * Math.PI * elapsedMs) / DRIFT_PERIOD_Y_MS),
  };
}

export interface VisualState {
  scale: number;
  brightness: number;
  saturate: number;
  /** Deslocamento em porcentagem do quadro. */
  x: number;
  y: number;
}

/** O estado visual da imagem num instante: respiração somada à batida. */
export function visualState(elapsedMs: number, pulse: number): VisualState {
  const eased = clamp(pulse, 0, 1);
  const drift = ambientDrift(elapsedMs);
  return {
    scale: ambientScale(elapsedMs) + eased * PULSE_SCALE,
    brightness: 1 + eased * PULSE_BRIGHTNESS,
    saturate: 1 + eased * PULSE_SATURATE,
    x: drift.x,
    y: drift.y,
  };
}
