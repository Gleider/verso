import { combinarTransform, derivaFlutuante, preenchimentoPadrao, progressoDeEntrada } from "./comum";
import type { EntradaDeSegmento, EntradaDeVerso, EstiloDeSegmento, EstiloDeVerso, ModoDeMovimento } from "./tipos";

const DESLOCAMENTO_PX = 70;

/** Entra deslizando lateralmente até o lugar. */
export const slide: ModoDeMovimento = {
  id: "slide",
  rotulo: "Deslizar",

  verso(entrada: EntradaDeVerso): EstiloDeVerso {
    const p = progressoDeEntrada(entrada);
    const x = (1 - p) * DESLOCAMENTO_PX;
    return {
      opacity: p,
      transform: combinarTransform(`translateX(${x.toFixed(2)}px)`, derivaFlutuante(entrada)),
      clipPath: null,
      recorta: false,
    };
  },

  segmento(entrada: EntradaDeSegmento): EstiloDeSegmento {
    return preenchimentoPadrao(entrada);
  },
};
