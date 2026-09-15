import { derivaFlutuante, progressoDeEntrada, progressoDeSaida, preenchimentoPadrao } from "./comum";
import type { EntradaDeSegmento, EntradaDeVerso, EstiloDeSegmento, EstiloDeVerso, ModoDeMovimento } from "./tipos";

/** Revelado por uma máscara que varre da esquerda; ao sair, varre de volta. */
export const wipe: ModoDeMovimento = {
  id: "wipe",
  rotulo: "Varredura",

  verso(entrada: EntradaDeVerso): EstiloDeVerso {
    const entrou = progressoDeEntrada(entrada);
    const saindo = progressoDeSaida(entrada);

    // Entrando: a máscara abre da esquerda para a direita.
    // Saindo: a borda esquerda avança e engole o verso.
    const escondidoDireita = (1 - entrou) * 100;
    const escondidoEsquerda = (1 - saindo) * 100;

    return {
      opacity: 1,
      transform: derivaFlutuante(entrada),
      clipPath: `inset(0 ${escondidoDireita.toFixed(2)}% 0 ${escondidoEsquerda.toFixed(2)}%)`,
      recorta: false,
    };
  },

  segmento(entrada: EntradaDeSegmento): EstiloDeSegmento {
    return preenchimentoPadrao(entrada);
  },
};
