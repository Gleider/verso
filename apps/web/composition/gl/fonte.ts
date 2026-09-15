/**
 * Monta o GLSL da combinação escolhida.
 *
 * Fundo e efeito viram `#define`, não ramo em tempo de execução: o shader
 * compilado contém só o que aquela combinação usa. É o que permite **uma
 * passada** — o fundo é uma função que o efeito chama quantas vezes quiser,
 * em vez de um passe anterior cujo resultado precisa ser copiado.
 *
 * Função pura: mesma chave, mesmo fonte. `programa.ts` cacheia por essa chave.
 */
import { CORES, RUIDO } from "./glsl/comum";
import { EFEITOS } from "./glsl/efeitos";
import { FUNDOS } from "./glsl/fundos";

/** Os fundos gerados por código. Fora daqui, o fundo é imagem ou cor sólida. */
export const FUNDOS_GERADOS = [
  "aurora",
  "brasa",
  "oceano",
  "neon",
  "papel",
  "grade",
  "raios",
  "vinil",
  "vazamento",
] as const;

export type FundoGerado = (typeof FUNDOS_GERADOS)[number];

/** As texturas que exigem GPU. O resto é CSS (`efeitos/texturas-css.ts`). */
export const EFEITOS_GL = [
  "halftone",
  "vhs",
  "crt",
  "cromatico",
  "zoomblur",
  "pixelate",
  "bloom",
] as const;

export type EfeitoGl = (typeof EFEITOS_GL)[number];

export type Combinacao = {
  /** `null` quando o fundo é imagem ou cor sólida. */
  fundo: FundoGerado | null;
  /** `null` quando nenhuma textura de GPU está ativa. */
  efeito: EfeitoGl | null;
  /** true quando há textura de imagem para amostrar. */
  temImagem: boolean;
};

/** Identifica o programa compilado. Combinações iguais reusam o mesmo. */
export function chaveDaCombinacao(c: Combinacao): string {
  return `${c.fundo ?? "-"}|${c.efeito ?? "-"}|${c.temImagem ? "img" : "cor"}`;
}

export const VERTEX = /* glsl */ `#version 300 es
// Triângulo único que cobre a tela: mais barato que dois triângulos e sem a
// costura diagonal no meio.
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const CORPO_DO_FUNDO: Record<FundoGerado, string> = {
  aurora: "fundo_aurora",
  brasa: "fundo_brasa",
  oceano: "fundo_oceano",
  neon: "fundo_neon",
  papel: "fundo_papel",
  grade: "fundo_grade",
  raios: "fundo_raios",
  vinil: "fundo_vinil",
  vazamento: "fundo_vazamento",
};

export function montarFragmento(c: Combinacao): string {
  const amostra = c.fundo
    ? `${CORPO_DO_FUNDO[c.fundo]}(uv, uTamanho, uMs, uAmbiente, uPulso)`
    : c.temImagem
      ? "textureCoberta(uv)"
      : "uCor";

  return `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uTamanho;      // pixels do espaço de design
uniform float uMs;          // único relógio
uniform float uPulso;       // batida 0..1
uniform float uAmbiente;    // intensidade do movimento ambiente
uniform float uIntensidade; // intensidade da textura
uniform vec3 uCor;          // cor sólida, quando não há fundo nem imagem
uniform sampler2D uImagem;
uniform vec2 uTamanhoImagem;

${RUIDO}
${CORES}

/**
 * Enquadra a imagem em "cover": preenche o quadro e corta a sobra.
 *
 * Sem isto a foto sai esticada: e o mesmo que object-fit: cover resolve no
 * DOM, e que o CanvasImage com fit=cover fazia antes.
 */
vec3 textureCoberta(vec2 uv) {
  float alvo = uTamanho.x / uTamanho.y;
  float fonte = uTamanhoImagem.x / max(uTamanhoImagem.y, 1.0);
  vec2 e = vec2(1.0);
  if (fonte > alvo) e.x = alvo / fonte; else e.y = fonte / alvo;
  vec2 p = (uv - 0.5) * e + 0.5;
  return texture(uImagem, p).rgb;
}

${FUNDOS}

/* O fundo desta combinacao. Os efeitos chamam isto quantas vezes precisarem. */
vec3 amostrar(vec2 uv) {
  return ${amostra};
}

${EFEITOS}

void main() {
  vec2 uv = vUv;
  float i = uIntensidade;

  // 1) transformações de UV, antes de qualquer amostragem
${c.efeito === "pixelate" ? "  uv = ef_pixelar(uv, uTamanho, i, uPulso);" : ""}
${c.efeito === "crt" ? "  uv = ef_barril(uv, uTamanho, i);" : ""}

  // 2) amostragem (o efeito decide quantas vezes lê o fundo)
  vec3 cor;
${
  c.efeito === "cromatico"
    ? "  cor = ef_cromatico(uv, uTamanho, uMs, i, uPulso);"
    : c.efeito === "vhs"
      ? "  cor = ef_vhs_cor(uv, uTamanho, i, uPulso);"
      : c.efeito === "zoomblur"
        ? "  cor = ef_zoomblur(uv, uTamanho, i, uPulso);"
        : c.efeito === "bloom"
          ? "  cor = ef_bloom(uv, uTamanho, i, uPulso);"
          : c.efeito === "halftone"
            ? "  cor = ef_halftone(uv, uTamanho, i);"
            : "  cor = amostrar(uv);"
}

  // 3) superfícies, depois de ter a cor
${c.efeito === "vhs" ? "  cor = ef_varredura(cor, uv, uTamanho, uMs, i, 5.0, 22.0);" : ""}
${c.efeito === "vhs" ? "  cor = ef_chiado(cor, uv, uMs, i);" : ""}
${c.efeito === "vhs" ? "  cor = ef_vinheta(cor, uv, uTamanho, mix(0.2, 0.5, i), 0.45);" : ""}
${c.efeito === "crt" ? "  cor = ef_varredura(cor, uv, uTamanho, uMs, i, 4.0, 40.0);" : ""}
${c.efeito === "crt" ? "  cor = ef_vinheta(cor, uv, uTamanho, mix(0.35, 0.8, i), 0.30);" : ""}

  // O barril joga UV para fora do quadro: ali é moldura, não imagem esticada.
${
  c.efeito === "crt"
    ? "  float fora = step(uv.x, 0.0) + step(1.0, uv.x) + step(uv.y, 0.0) + step(1.0, uv.y);\n  cor = mix(cor, vec3(0.0), clamp(fora, 0.0, 1.0));"
    : ""
}

  fragColor = vec4(cor, 1.0);
}
`;
}
