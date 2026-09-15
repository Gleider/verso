import {
  amplitude,
  combinarTransform,
  derivaFlutuante,
  envelope,
  preenchimentoPadrao,
  progressoDeEntrada,
} from "./comum";
import type { EntradaDeSegmento, EntradaDeVerso, EstiloDeSegmento, EstiloDeVerso, ModoDeMovimento } from "./tipos";

const ENTRADA = 0.45;
const CRESCIMENTO = 0.22;

/** Entra pequeno e continua crescendo enquanto está em cena. */
export const scaling: ModoDeMovimento = {
  id: "scaling",
  rotulo: "Crescimento",

  verso(entrada: EntradaDeVerso): EstiloDeVerso {
    const amp = amplitude(entrada);
    const p = progressoDeEntrada(entrada);
    const emCena = Math.min(1, Math.max(0, entrada.msNoVerso / Math.max(1, entrada.duracaoMs)));

    // Duas parcelas somadas: o salto da entrada (rápido) e a deriva de escala
    // ao longo do verso (lenta). Separadas porque a segunda precisa continuar
    // depois que a primeira já assentou.
    const escala = 1 - (1 - p) * ENTRADA * amp + emCena * CRESCIMENTO * amp;

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
