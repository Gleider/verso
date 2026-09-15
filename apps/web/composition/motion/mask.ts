import {
  amplitude,
  combinarTransform,
  derivaFlutuante,
  envelope,
  preenchimentoPadrao,
  progressoDeEntrada,
} from "./comum";
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
 *
 * A entrada abre a letra num leve afastamento horizontal: como a cor vem da
 * imagem, um fade puro quase não se nota sobre um fundo claro.
 */
export const mask: ModoDeMovimento = {
  id: "mask",
  rotulo: "Recorte",

  verso(entrada: EntradaDeVerso): EstiloDeVerso {
    const p = progressoDeEntrada(entrada);
    const amp = amplitude(entrada);
    const escalaX = 1 + (1 - p) * 0.18 * amp;
    const escalaY = 1 - (1 - p) * 0.1 * amp;

    return {
      opacity: envelope(entrada),
      transform: combinarTransform(
        `scale(${escalaX.toFixed(4)}, ${escalaY.toFixed(4)})`,
        derivaFlutuante(entrada),
      ),
      clipPath: null,
      recorta: true,
    };
  },

  segmento(entrada: EntradaDeSegmento): EstiloDeSegmento {
    return preenchimentoPadrao(entrada);
  },
};
