import { hash } from "../aleatorio";
import { amplitude, derivaFlutuante, envelope } from "./comum";
import type { EntradaDeSegmento, EntradaDeVerso, EstiloDeSegmento, EstiloDeVerso, ModoDeMovimento } from "./tipos";

const AMPLITUDE_PX = 22;
const AMPLITUDE_ATIVO_PX = 34;
const PERIODO_MS = 1100;
const ESCALA_ATIVO = 0.22;

/** Cada segmento flutua com fase própria; o que está sendo cantado salta. */
export const bubbling: ModoDeMovimento = {
  id: "bubbling",
  rotulo: "Borbulhar",

  verso(entrada: EntradaDeVerso): EstiloDeVerso {
    return {
      opacity: envelope(entrada),
      transform: derivaFlutuante(entrada),
      clipPath: null,
      recorta: false,
    };
  },

  segmento(entrada: EntradaDeSegmento): EstiloDeSegmento {
    const { indice, indiceAtual, preenchimento, msAbsoluto } = entrada;
    const cheio = indice < indiceAtual ? 1 : indice === indiceAtual ? preenchimento : 0;
    const amp = amplitude(entrada);

    // Todo segmento flutua, com fase própria — sem isso o verso parece um
    // bloco parado com uma sílaba pulando sozinha. O relógio é `msAbsoluto`
    // para que a onda não reinicie a cada verso.
    const fase = hash(indice * 5.1 + entrada.indiceDoVerso * 1.9) * Math.PI * 2;
    const onda = Math.sin((2 * Math.PI * msAbsoluto) / PERIODO_MS + fase);

    const ativo = indice === indiceAtual;
    const y = onda * (ativo ? AMPLITUDE_ATIVO_PX : AMPLITUDE_PX) * amp;
    const escala = ativo ? 1 + ESCALA_ATIVO * amp * preenchimento : 1;

    return {
      preenchimento: cheio,
      opacity: 1,
      transform: `translateY(${y.toFixed(2)}px) scale(${escala.toFixed(4)})`,
    };
  },
};
