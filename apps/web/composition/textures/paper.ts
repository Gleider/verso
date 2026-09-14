import { hash } from "./comum";
import { ESTADO_NEUTRO } from "./tipos";
import type { EstadoDeTextura, Textura } from "./tipos";

const BLOCO_MS = 33;
const GRANULADO: readonly [number, number] = [0.04, 0.18];
const DESLOCAMENTO_PX: readonly [number, number] = [2, 10];
const VINHETA: readonly [number, number] = [0.1, 0.35];

const lerp = ([de, ate]: readonly [number, number], t: number) => de + (ate - de) * t;

/** Papel amassado, luz irregular: um sépia leve com grão fino e cantos escuros. */
export const papelTextura: Textura = (ms, intensidade) => {
  const i = Math.min(1, Math.max(0, intensidade));
  const bloco = Math.floor(ms / BLOCO_MS);

  const estado: EstadoDeTextura = {
    ...ESTADO_NEUTRO,
    filter: `sepia(${(0.12 + i * 0.15).toFixed(3)}) contrast(${(0.96 + i * 0.06).toFixed(3)})`,
    granulado: lerp(GRANULADO, i),
    vinheta: lerp(VINHETA, i),
    deslocamento: {
      x: (hash(bloco * 2.1) - 0.5) * lerp(DESLOCAMENTO_PX, i),
      y: (hash(bloco * 3.4) - 0.5) * lerp(DESLOCAMENTO_PX, i),
    },
  };
  return estado;
};
