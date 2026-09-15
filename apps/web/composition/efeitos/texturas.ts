/**
 * As texturas que exigem GPU — só DADO.
 *
 * O desenho está em `gl/glsl/efeitos.ts`, tudo dentro do mesmo `main()`. Aqui
 * fica o catálogo que o painel mostra.
 *
 * O critério de estar nesta lista, e não em `texturas-css.ts`, é um só: **o
 * efeito precisa AMOSTRAR os pixels vizinhos**. Retícula lê a luminância da
 * célula, cromático lê três posições, borrão radial lê doze. Grão, sépia e
 * vinheta não leem nada — são filtro ou camada, e por isso são CSS e de graça.
 *
 * Seis texturas saíram nesta rodada (papel, térmico, vazamento, relevo,
 * curvas, desligando): cada uma era GLSL a manter e nenhuma aparecia em
 * template ou combinação de estilo. Os ids continuam válidos no schema, para
 * projeto salvo não quebrar — ver o comentário em `settings.ts`.
 */
import type { EfeitoGl } from "../gl/fonte";

export type Textura = {
  id: EfeitoGl;
  rotulo: string;
  /** Uma linha, mostrada no painel — o nome sozinho não diz o que faz. */
  descricao: string;
};

export const TEXTURAS: Textura[] = [
  {
    id: "vhs",
    rotulo: "VHS",
    descricao: "Varredura, sangria de cor e chiado de fita.",
  },
  {
    id: "crt",
    rotulo: "Tubo",
    descricao: "Tela curva de TV antiga, com varredura e cantos escuros.",
  },
  {
    id: "halftone",
    rotulo: "Retícula",
    descricao: "Pontos de impressão que crescem com a sombra.",
  },
  {
    id: "cromatico",
    rotulo: "Cromático",
    descricao: "Os canais de cor se separam e giram.",
  },
  {
    id: "bloom",
    rotulo: "Estouro",
    descricao: "As luzes vazam e derretem, tipo sonho.",
  },
  {
    id: "zoomblur",
    rotulo: "Explosão",
    descricao: "Borrão radial que salta na batida.",
  },
  {
    id: "glitch",
    rotulo: "Glitch",
    descricao: "Faixas saltam de lado, os canais se separam e a linha rasga.",
  },
  {
    id: "pixelate",
    rotulo: "Pixelado",
    descricao: "Blocos grandes, que encolhem quando a música bate.",
  },
];

const POR_ID = new Map(TEXTURAS.map((t) => [t.id, t]));

/** A textura de GPU deste id, ou `null` quando é CSS, aposentada ou inválida. */
export function texturaShaderPorId(id: string): Textura | null {
  return POR_ID.get(id as EfeitoGl) ?? null;
}

/** true quando a textura escolhida exige canvas — o caminho caro. */
export function ehTexturaShader(id: string): boolean {
  return POR_ID.has(id as EfeitoGl);
}
