import { derivaFlutuante, preenchimentoPadrao, VERSO_PARADO } from "./comum";
import type { EntradaDeSegmento, EntradaDeVerso, EstiloDeSegmento, EstiloDeVerso, ModoDeMovimento } from "./tipos";

/** O karaokê de hoje: a cor avança dentro do verso, sem mexer na geometria. */
export const fill: ModoDeMovimento = {
  id: "fill",
  rotulo: "Preenchimento",

  verso(entrada: EntradaDeVerso): EstiloDeVerso {
    return { ...VERSO_PARADO, transform: derivaFlutuante(entrada) };
  },

  segmento(entrada: EntradaDeSegmento): EstiloDeSegmento {
    return preenchimentoPadrao(entrada);
  },
};
