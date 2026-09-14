import { combinarTransform, derivaFlutuante, preenchimentoPadrao, progressoDeEntrada } from "./comum";
import type { EntradaDeSegmento, EntradaDeVerso, EstiloDeSegmento, EstiloDeVerso, ModoDeMovimento } from "./tipos";

/** Entra com um salto curto de escala, como se saltasse para o lugar. */
export const popup: ModoDeMovimento = {
  id: "popup",
  rotulo: "Salto",

  verso(entrada: EntradaDeVerso): EstiloDeVerso {
    const p = progressoDeEntrada(entrada);
    const escala = 0.82 + 0.18 * p;
    return {
      opacity: p,
      transform: combinarTransform(`scale(${escala.toFixed(4)})`, derivaFlutuante(entrada)),
      clipPath: null,
      recorta: false,
    };
  },

  segmento(entrada: EntradaDeSegmento): EstiloDeSegmento {
    return preenchimentoPadrao(entrada);
  },
};
