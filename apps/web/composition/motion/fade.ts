import { amplitude, combinarTransform, derivaFlutuante, envelope, preenchimentoPadrao } from "./comum";
import type { EntradaDeSegmento, EntradaDeVerso, EstiloDeSegmento, EstiloDeVerso, ModoDeMovimento } from "./tipos";

/** O verso aparece e some por opacidade, com uma aproximação leve junto. */
export const fade: ModoDeMovimento = {
  id: "fade",
  rotulo: "Esmaecer",

  verso(entrada: EntradaDeVerso): EstiloDeVerso {
    const e = envelope(entrada);
    const amp = amplitude(entrada);
    // Começa um pouco maior e assenta: dá peso ao aparecimento.
    const escala = 1 + (1 - e) * 0.12 * amp;
    return {
      opacity: e,
      transform: combinarTransform(`scale(${escala.toFixed(4)})`, derivaFlutuante(entrada)),
      clipPath: null,
      recorta: false,
    };
  },

  segmento(entrada: EntradaDeSegmento): EstiloDeSegmento {
    return preenchimentoPadrao(entrada);
  },
};
