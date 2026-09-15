import {
  amplitude,
  combinarTransform,
  derivaFlutuante,
  progressoDeEntrada,
  progressoDeSaida,
  preenchimentoPadrao,
} from "./comum";
import type { EntradaDeSegmento, EntradaDeVerso, EstiloDeSegmento, EstiloDeVerso, ModoDeMovimento } from "./tipos";

const DESLOCAMENTO_PX = 220;

/** Entra deslizando de um lado e sai pelo outro. */
export const slide: ModoDeMovimento = {
  id: "slide",
  rotulo: "Deslizar",

  verso(entrada: EntradaDeVerso): EstiloDeVerso {
    const entrou = progressoDeEntrada(entrada);
    const saindo = progressoDeSaida(entrada);
    const amp = DESLOCAMENTO_PX * amplitude(entrada);

    // Entra pela direita; ao sair, continua para a esquerda.
    const x = (1 - entrou) * amp - (1 - saindo) * amp;

    return {
      opacity: Math.min(entrou, saindo),
      transform: combinarTransform(`translateX(${x.toFixed(2)}px)`, derivaFlutuante(entrada)),
      clipPath: null,
      recorta: false,
    };
  },

  segmento(entrada: EntradaDeSegmento): EstiloDeSegmento {
    return preenchimentoPadrao(entrada);
  },
};
