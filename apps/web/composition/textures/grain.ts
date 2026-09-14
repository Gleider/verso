import { hash } from "./comum";
import { ESTADO_NEUTRO } from "./tipos";
import type { EstadoDeTextura, Textura } from "./tipos";

/** Troca ~30 vezes por segundo — rápido o bastante para parecer grão de filme. */
const BLOCO_MS = 33;

/**
 * Granulado fino e animado.
 *
 * Amplitude com piso: `pitfalls.md` §12 registra o defeito real deste
 * projeto de um efeito com amplitude pequena demais para ser visto. Mesmo em
 * intensidade 0 o grão fica perceptível — quem escolheu a textura quer vê-la;
 * "quase imperceptível" é o padrão de outras texturas, não ausência total.
 */
const OPACIDADE: readonly [number, number] = [0.05, 0.35];
const DESLOCAMENTO_PX: readonly [number, number] = [4, 24];

const lerp = ([de, ate]: readonly [number, number], t: number) => de + (ate - de) * t;

export const grao: Textura = (ms, intensidade) => {
  const i = Math.min(1, Math.max(0, intensidade));
  const bloco = Math.floor(ms / BLOCO_MS);

  const estado: EstadoDeTextura = {
    ...ESTADO_NEUTRO,
    granulado: lerp(OPACIDADE, i),
    deslocamento: {
      x: (hash(bloco) - 0.5) * lerp(DESLOCAMENTO_PX, i),
      y: (hash(bloco * 1.7) - 0.5) * lerp(DESLOCAMENTO_PX, i),
    },
  };
  return estado;
};
