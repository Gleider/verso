import { hash } from "../textures/comum";
import { derivaFlutuante, VERSO_PARADO } from "./comum";
import type { EntradaDeSegmento, EntradaDeVerso, EstiloDeSegmento, EstiloDeVerso, ModoDeMovimento } from "./tipos";

const AMPLITUDE_PX = 9;
const PERIODO_MS = 900;

/** Palavras (ou sílabas) com deslocamento vertical alternado, tipo borbulha. */
export const bubbling: ModoDeMovimento = {
  id: "bubbling",
  rotulo: "Borbulhar",

  verso(entrada: EntradaDeVerso): EstiloDeVerso {
    return { ...VERSO_PARADO, transform: derivaFlutuante(entrada) };
  },

  segmento(entrada: EntradaDeSegmento): EstiloDeSegmento {
    const { indice, indiceAtual, preenchimento, msNoVerso } = entrada;
    const cheio = indice < indiceAtual ? 1 : indice === indiceAtual ? preenchimento : 0;

    // Só borbulha o segmento sendo cantado agora — os outros ficam parados.
    const ativo = indice === indiceAtual;
    const sinal = indice % 2 === 0 ? -1 : 1;
    const fase = hash(indice * 5.1) * Math.PI * 2;
    const onda = ativo
      ? Math.sin((2 * Math.PI * msNoVerso) / PERIODO_MS + fase) * AMPLITUDE_PX * sinal
      : 0;

    return {
      preenchimento: cheio,
      opacity: 1,
      transform: onda === 0 ? "none" : `translateY(${onda.toFixed(2)}px)`,
    };
  },
};
