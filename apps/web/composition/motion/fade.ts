import { derivaFlutuante, preenchimentoPadrao, progressoDeEntrada } from "./comum";
import type { EntradaDeSegmento, EntradaDeVerso, EstiloDeSegmento, EstiloDeVerso, ModoDeMovimento } from "./tipos";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** O verso aparece e some por opacidade. */
export const fade: ModoDeMovimento = {
  id: "fade",
  rotulo: "Esmaecer",

  verso(entrada: EntradaDeVerso): EstiloDeVerso {
    const entra = progressoDeEntrada(entrada);
    const msParaOFim = entrada.duracaoMs - entrada.msNoVerso;
    const sai = clamp(msParaOFim / Math.max(1, entrada.entradaMs), 0, 1);
    return {
      opacity: Math.min(entra, sai),
      transform: derivaFlutuante(entrada),
      clipPath: null,
      recorta: false,
    };
  },

  segmento(entrada: EntradaDeSegmento): EstiloDeSegmento {
    return preenchimentoPadrao(entrada);
  },
};
