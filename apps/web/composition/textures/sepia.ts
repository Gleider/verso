import { ESTADO_NEUTRO } from "./tipos";
import type { EstadoDeTextura, Textura } from "./tipos";

const SEPIA: readonly [number, number] = [0.35, 0.92];
const CONTRASTE: readonly [number, number] = [1.0, 1.12];

const lerp = ([de, ate]: readonly [number, number], t: number) => de + (ate - de) * t;

/** Vira monocromático quente. Só filtro de cor, sem sobreposição. */
export const sepiaTextura: Textura = (_ms, intensidade) => {
  const i = Math.min(1, Math.max(0, intensidade));
  const estado: EstadoDeTextura = {
    ...ESTADO_NEUTRO,
    filter: `sepia(${lerp(SEPIA, i).toFixed(3)}) contrast(${lerp(CONTRASTE, i).toFixed(3)}) saturate(${(1 - i * 0.3).toFixed(3)})`,
  };
  return estado;
};
