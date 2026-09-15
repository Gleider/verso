/**
 * Os efeitos de texto do painel Font, como valores de CSS prontos.
 *
 * Lógica pura: `layers/Verso.tsx` só escreve o que sai daqui no `style`.
 *
 * Todos os três são proporcionais ao corpo da letra. Um contorno de 3 px é
 * grosso demais aos 52 px e invisível aos 136 px — em valor absoluto, o
 * mesmo controle pareceria quebrado nos dois extremos do seletor de tamanho.
 */
import type { Paleta } from "./palettes";
import type { VideoSettings } from "./settings";

export type EfeitosDeTexto = {
  textShadow: string | undefined;
  WebkitTextStroke: string | undefined;
  /** `paint-order`, para o contorno ficar ATRÁS do preenchimento. */
  paintOrder: string | undefined;
  /** Vai no contêiner, não no glifo: `drop-shadow` segue a forma do texto. */
  filter: string | undefined;
  letterSpacing: number | undefined;
};

const clamp = (valor: number, min: number, max: number) => Math.min(max, Math.max(min, valor));

export function efeitosDeTexto(
  font: VideoSettings["font"],
  paleta: Paleta,
  tamanho: number,
): EfeitosDeTexto {
  const sombra = clamp(font.sombra, 0, 1);
  const contorno = clamp(font.contorno, 0, 1);
  const brilho = clamp(font.brilho, 0, 1);

  return {
    textShadow:
      sombra > 0.01
        ? [
            `0 ${(tamanho * 0.045 * sombra).toFixed(2)}px ${(tamanho * 0.09 * sombra).toFixed(2)}px rgba(0,0,0,${(0.85 * sombra).toFixed(3)})`,
            `0 0 ${(tamanho * 0.26 * sombra).toFixed(2)}px rgba(0,0,0,${(0.5 * sombra).toFixed(3)})`,
          ].join(", ")
        : undefined,

    WebkitTextStroke:
      contorno > 0.01
        ? `${(tamanho * 0.035 * contorno).toFixed(2)}px ${paleta.contorno}`
        : undefined,

    // Sem isto o contorno é desenhado POR CIMA do preenchimento e come metade
    // da espessura do glifo. Preview e render são os dois Chromium, então a
    // propriedade vale nos dois.
    paintOrder: contorno > 0.01 ? "stroke fill" : undefined,

    filter:
      brilho > 0.01
        ? [
            `drop-shadow(0 0 ${(tamanho * 0.1 * brilho).toFixed(2)}px ${paleta.sung})`,
            `drop-shadow(0 0 ${(tamanho * 0.32 * brilho).toFixed(2)}px ${paleta.sung})`,
          ].join(" ")
        : undefined,

    letterSpacing: Math.abs(font.espacamento) > 0.01 ? font.espacamento : undefined,
  };
}
