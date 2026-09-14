import { derivaFlutuante, preenchimentoPadrao } from "./comum";
import type { EntradaDeSegmento, EntradaDeVerso, EstiloDeSegmento, EstiloDeVerso, ModoDeMovimento } from "./tipos";

/**
 * O texto recorta a imagem em vez de ter cor própria.
 *
 * `recorta: true` é o sinal para `layers/Verso.tsx`: em vez de preencher o
 * texto com a paleta, ele usa a imagem de fundo como `background-image` do
 * próprio texto (`background-clip: text`). Simplificação deliberada: a
 * imagem dentro do texto é uma cópia centralizada e ampliada para cobrir o
 * quadro, não um recorte pixel-a-pixel alinhado ao fundo por trás — registro
 * exato exigiria conhecer a posição absoluta do bloco de texto no quadro
 * inteiro, o que nenhum outro modo precisa saber.
 */
export const mask: ModoDeMovimento = {
  id: "mask",
  rotulo: "Recorte",

  verso(entrada: EntradaDeVerso): EstiloDeVerso {
    return {
      opacity: 1,
      transform: derivaFlutuante(entrada),
      clipPath: null,
      recorta: true,
    };
  },

  segmento(entrada: EntradaDeSegmento): EstiloDeSegmento {
    return preenchimentoPadrao(entrada);
  },
};
