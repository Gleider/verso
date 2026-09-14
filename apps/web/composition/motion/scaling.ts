import { combinarTransform, derivaFlutuante, preenchimentoPadrao } from "./comum";
import type { EntradaDeSegmento, EntradaDeVerso, EstiloDeSegmento, EstiloDeVerso, ModoDeMovimento } from "./tipos";

const CRESCIMENTO_MAXIMO = 0.08;

/** Cresce continuamente enquanto está em cena, não só na entrada. */
export const scaling: ModoDeMovimento = {
  id: "scaling",
  rotulo: "Crescimento",

  verso(entrada: EntradaDeVerso): EstiloDeVerso {
    const progresso = Math.min(1, Math.max(0, entrada.msNoVerso / Math.max(1, entrada.duracaoMs)));
    const escala = 1 + CRESCIMENTO_MAXIMO * progresso;
    return {
      opacity: 1,
      transform: combinarTransform(`scale(${escala.toFixed(4)})`, derivaFlutuante(entrada)),
      clipPath: null,
      recorta: false,
    };
  },

  segmento(entrada: EntradaDeSegmento): EstiloDeSegmento {
    return preenchimentoPadrao(entrada);
  },
};
