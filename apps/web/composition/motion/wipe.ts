import { derivaFlutuante, preenchimentoPadrao, progressoDeEntrada } from "./comum";
import type { EntradaDeSegmento, EntradaDeVerso, EstiloDeSegmento, EstiloDeVerso, ModoDeMovimento } from "./tipos";

/** Revelado por uma máscara que varre o verso da esquerda para a direita. */
export const wipe: ModoDeMovimento = {
  id: "wipe",
  rotulo: "Varredura",

  verso(entrada: EntradaDeVerso): EstiloDeVerso {
    const p = progressoDeEntrada(entrada);
    const escondido = (1 - p) * 100;
    return {
      opacity: 1,
      transform: derivaFlutuante(entrada),
      clipPath: `inset(0 ${escondido.toFixed(2)}% 0 0)`,
      recorta: false,
    };
  },

  segmento(entrada: EntradaDeSegmento): EstiloDeSegmento {
    return preenchimentoPadrao(entrada);
  },
};
