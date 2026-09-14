import { derivaFlutuante, preenchimentoPadrao, VERSO_PARADO } from "./comum";
import type { EntradaDeSegmento, EntradaDeVerso, EstiloDeSegmento, EstiloDeVerso, ModoDeMovimento } from "./tipos";

/** Aparece e fica. Sem animação de entrada. */
export const estatico: ModoDeMovimento = {
  id: "static",
  rotulo: "Estático",

  verso(entrada: EntradaDeVerso): EstiloDeVerso {
    return { ...VERSO_PARADO, transform: derivaFlutuante(entrada) };
  },

  segmento(entrada: EntradaDeSegmento): EstiloDeSegmento {
    return preenchimentoPadrao(entrada);
  },
};
