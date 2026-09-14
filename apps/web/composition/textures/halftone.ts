import { ESTADO_NEUTRO } from "./tipos";
import type { EstadoDeTextura, Textura } from "./tipos";

/** Retícula de impressão. Estática — a trama de impressão não se move. */
const RETICULA: readonly [number, number] = [0.12, 0.4];
const CONTRASTE: readonly [number, number] = [1.0, 1.15];

const lerp = ([de, ate]: readonly [number, number], t: number) => de + (ate - de) * t;

export const halftoneTextura: Textura = (_ms, intensidade) => {
  const i = Math.min(1, Math.max(0, intensidade));
  const estado: EstadoDeTextura = {
    ...ESTADO_NEUTRO,
    filter: `contrast(${lerp(CONTRASTE, i).toFixed(3)}) grayscale(${(i * 0.3).toFixed(3)})`,
    reticula: lerp(RETICULA, i),
  };
  return estado;
};
