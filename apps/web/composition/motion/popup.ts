import {
  amplitude,
  combinarTransform,
  derivaFlutuante,
  envelope,
  progressoDeEntrada,
  preenchimentoPadrao,
} from "./comum";
import type { EntradaDeSegmento, EntradaDeVerso, EstiloDeSegmento, EstiloDeVerso, ModoDeMovimento } from "./tipos";

/** Entra com um salto curto de escala, passando um pouco do ponto e voltando. */
export const popup: ModoDeMovimento = {
  id: "popup",
  rotulo: "Salto",

  verso(entrada: EntradaDeVerso): EstiloDeVerso {
    const p = progressoDeEntrada(entrada);
    const amp = amplitude(entrada);

    // Começa pequeno e passa do ponto antes de assentar — o seno dá o
    // exagero no meio da entrada, sem depender de estado entre quadros.
    const base = 1 - (1 - p) * 0.55 * amp;
    const exagero = Math.sin(p * Math.PI) * 0.14 * amp;
    const escala = base + exagero;

    return {
      opacity: envelope(entrada),
      transform: combinarTransform(`scale(${escala.toFixed(4)})`, derivaFlutuante(entrada)),
      clipPath: null,
      recorta: false,
    };
  },

  segmento(entrada: EntradaDeSegmento): EstiloDeSegmento {
    return preenchimentoPadrao(entrada);
  },
};
