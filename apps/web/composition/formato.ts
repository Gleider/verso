/**
 * Proporção da composição: 16:9 e 9:16 pela mesma técnica.
 *
 * Espaço de design FIXO por proporção, escalado por um fator único — não
 * layout responsivo. Um layout responsivo de verdade (tudo em % e vw) obriga
 * cada decisão tipográfica a ser reavaliada em dois enquadramentos, e a
 * métrica que importa — quantos caracteres cabem numa linha — não escala
 * proporcionalmente entre 16:9 e 9:16. Espaço de design fixo dá um número de
 * pixels autorais por proporção e um só fator de escala para a resolução.
 *
 * A composição envolve tudo num <div> de exatamente DESIGN[aspect] px, com
 * `transform: scale(fator)` e `transformOrigin: "top left"`. Dentro dele,
 * tudo em px de design — nenhuma fórmula de tamanho no corpo dos componentes.
 */
import type { AspectRatio, Resolucao, VideoSettings } from "./settings";

/** O espaço em que o desenho é AUTORADO. Nada aqui muda com a resolução. */
export const DESIGN: Record<AspectRatio, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

/** A resolução de SAÍDA. O lado curto manda: 720p é 720 px de lado curto. */
const LADO_CURTO: Record<Resolucao, number> = { "720p": 720, "1080p": 1080 };

export type Dimensoes = { width: number; height: number };

/**
 * Dimensões finais do vídeo, em pixels pares.
 *
 * O fator é idêntico nas duas proporções: o lado curto de ambos os espaços de
 * design (16:9 e 9:16) é 1080, então 720p sempre dá fator 2/3 e 1080p sempre
 * dá fator 1 — trocar de proporção nunca muda a nitidez.
 */
export function dimensoesDaSaida(settings: VideoSettings): Dimensoes {
  const design = DESIGN[settings.output.aspectRatio];
  const fator = LADO_CURTO[settings.output.resolution] / Math.min(design.width, design.height);
  // O codificador H.264 exige dimensões pares.
  return {
    width: 2 * Math.round((design.width * fator) / 2),
    height: 2 * Math.round((design.height * fator) / 2),
  };
}

/** O fator de `transform: scale()` que leva o espaço de design à saída. */
export function escalaDeDesign(settings: VideoSettings): number {
  const { width } = dimensoesDaSaida(settings);
  return width / DESIGN[settings.output.aspectRatio].width;
}

/**
 * Tipografia e caixa de conteúdo são AUTORAIS por proporção, não derivadas.
 *
 * Derivar de `width * k` não funciona: 5% de 1920 e 5% de 1080 são proporções
 * muito diferentes em relação à altura de cada formato. Uma tabela de doze
 * números é a coisa mais fácil de calibrar olhando — e é o que a spec pede:
 * "um design parece certo nos dois".
 */
export const TIPOGRAFIA: Record<
  AspectRatio,
  {
    tamanho: Record<"small" | "medium" | "large", number>;
    margemLateral: number;
    larguraMaxima: number;
  }
> = {
  "16:9": {
    tamanho: { small: 56, medium: 76, large: 104 },
    margemLateral: 120,
    larguraMaxima: 1560,
  },
  "9:16": {
    tamanho: { small: 48, medium: 64, large: 86 },
    margemLateral: 72,
    larguraMaxima: 936,
  },
};
