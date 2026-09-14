import { hash } from "./comum";
import { ESTADO_NEUTRO } from "./tipos";
import type { EstadoDeTextura, Textura } from "./tipos";

const BLOCO_MS = 33;
const JANELA_RISCO_MS = 700;
const ALTURA_RISCO = 1.2;

const GRANULADO: readonly [number, number] = [0.08, 0.3];
const VINHETA: readonly [number, number] = [0.15, 0.5];
/** Quanto MENOR, mais vezes o risco aparece. */
const CHANCE_DE_RISCO: readonly [number, number] = [0.85, 0.35];

const lerp = ([de, ate]: readonly [number, number], t: number) => de + (ate - de) * t;

/** Poeira e riscos de filme velho: grão pesado, vinheta e riscos verticais raros. */
export const poeiraTextura: Textura = (ms, intensidade) => {
  const i = Math.min(1, Math.max(0, intensidade));
  const bloco = Math.floor(ms / BLOCO_MS);
  const janela = Math.floor(ms / JANELA_RISCO_MS);

  const temRisco = hash(janela * 4.3) > lerp(CHANCE_DE_RISCO, i);

  const estado: EstadoDeTextura = {
    ...ESTADO_NEUTRO,
    filter: `contrast(${(1 + i * 0.08).toFixed(3)}) brightness(${(1 - i * 0.03).toFixed(3)})`,
    granulado: lerp(GRANULADO, i),
    vinheta: lerp(VINHETA, i),
    deslocamento: { x: (hash(bloco) - 0.5) * 6, y: (hash(bloco * 1.3) - 0.5) * 6 },
    faixa: temRisco
      ? { y: hash(janela * 2.7) * (100 - ALTURA_RISCO), height: ALTURA_RISCO, shift: 0 }
      : null,
  };
  return estado;
};
