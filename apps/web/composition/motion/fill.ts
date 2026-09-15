import { derivaFlutuante, envelope, preenchimentoPadrao } from "./comum";
import type { EntradaDeSegmento, EntradaDeVerso, EstiloDeSegmento, EstiloDeVerso, ModoDeMovimento } from "./tipos";

/** O karaokê clássico: a cor avança dentro do verso, sem mexer na geometria. */
export const fill: ModoDeMovimento = {
  id: "fill",
  rotulo: "Preenchimento",

  verso(entrada: EntradaDeVerso): EstiloDeVerso {
    return {
      opacity: envelope(entrada),
      transform: derivaFlutuante(entrada),
      clipPath: null,
      recorta: false,
    };
  },

  segmento(entrada: EntradaDeSegmento): EstiloDeSegmento {
    return preenchimentoPadrao(entrada);
  },
};
