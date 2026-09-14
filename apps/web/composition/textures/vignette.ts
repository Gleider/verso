import { ESTADO_NEUTRO } from "./tipos";
import type { EstadoDeTextura, Textura } from "./tipos";

/** Só o escurecimento das bordas. Piso visível mesmo em intensidade 0. */
const VINHETA: readonly [number, number] = [0.25, 0.85];

const lerp = ([de, ate]: readonly [number, number], t: number) => de + (ate - de) * t;

export const vinhetaTextura: Textura = (_ms, intensidade) => {
  const i = Math.min(1, Math.max(0, intensidade));
  const estado: EstadoDeTextura = { ...ESTADO_NEUTRO, vinheta: lerp(VINHETA, i) };
  return estado;
};
