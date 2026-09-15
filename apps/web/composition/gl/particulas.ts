/**
 * O canvas das partículas: contexto próprio, um programa, um `drawArrays`.
 *
 * Separado do fundo porque ele é **transparente** e pode ficar à frente da
 * letra — o do fundo é opaco e fica sempre atrás. Dois contextos é folgado
 * (o navegador dá ~16 por página), e cada um continua sendo uma passada só.
 */
import { CORES, RUIDO } from "./glsl/comum";
import { PARTICULAS } from "./glsl/particulas";
import { VERTEX } from "./fonte";
import type { ParticulaId } from "../settings";

/** `none` não chega aqui: `layers/Fundo`/`Karaoke` nem montam o canvas. */
const MODO: Record<Exclude<ParticulaId, "none">, number> = {
  poeira: 0,
  neve: 1,
  fagulhas: 2,
  estrelas: 3,
  vagalumes: 4,
};

export type UniformesDeParticulas = {
  tamanho: readonly [number, number];
  ms: number;
  pulso: number;
  modo: number;
  densidade: number;
  tamanhoDaParticula: number;
  velocidade: number;
  opacidade: number;
  cor: readonly [number, number, number] | null;
};

const FRAGMENTO = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uTamanho;
uniform float uMs;
uniform float uPulso;
uniform int uModo;
uniform float uDensidade;
uniform float uTamanhoP;
uniform float uVelocidade;
uniform float uOpacidade;
uniform vec3 uCor;
uniform bool uUsarCor;

${RUIDO}
${CORES}
${PARTICULAS}

void main() {
  vec4 p = campoDeParticulas(
    vUv, uTamanho, uMs, uModo,
    uDensidade, uTamanhoP, uVelocidade, uPulso, uCor, uUsarCor
  );
  fragColor = vec4(p.rgb, p.a * uOpacidade);
}
`;

const UNIFORMES = [
  "uTamanho",
  "uMs",
  "uPulso",
  "uModo",
  "uDensidade",
  "uTamanhoP",
  "uVelocidade",
  "uOpacidade",
  "uCor",
  "uUsarCor",
] as const;

type Compilado = { programa: WebGLProgram; locais: Record<string, WebGLUniformLocation | null> };

const contextos = new WeakMap<HTMLCanvasElement, WebGL2RenderingContext>();
const programas = new WeakMap<WebGL2RenderingContext, Compilado>();

export function modoDaParticula(tipo: ParticulaId): number {
  return tipo === "none" ? 0 : MODO[tipo];
}

function compilar(gl: WebGL2RenderingContext, tipo: number, fonte: string): WebGLShader {
  const s = gl.createShader(tipo);
  if (!s) throw new Error("Não foi possível criar o shader das partículas.");
  gl.shaderSource(s, fonte);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) ?? "(sem log)";
    gl.deleteShader(s);
    throw new Error(`Falha ao compilar o shader das partículas:\n${log}`);
  }
  return s;
}

function programaDe(gl: WebGL2RenderingContext): Compilado {
  const existente = programas.get(gl);
  if (existente) return existente;

  const vs = compilar(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compilar(gl, gl.FRAGMENT_SHADER, FRAGMENTO);
  const programa = gl.createProgram();
  if (!programa) throw new Error("Não foi possível criar o programa das partículas.");
  gl.attachShader(programa, vs);
  gl.attachShader(programa, fs);
  gl.linkProgram(programa);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) {
    throw new Error(`Falha ao ligar o programa das partículas:\n${gl.getProgramInfoLog(programa)}`);
  }

  const locais: Compilado["locais"] = {};
  for (const nome of UNIFORMES) locais[nome] = gl.getUniformLocation(programa, nome);
  const compilado = { programa, locais };
  programas.set(gl, compilado);
  return compilado;
}

export function desenharParticulas(canvas: HTMLCanvasElement, u: UniformesDeParticulas): void {
  let gl = contextos.get(canvas);
  if (!gl) {
    // `alpha: true` aqui, ao contrário do fundo: esta camada é uma sobreposição
    // e o que não é partícula precisa deixar passar o que está embaixo.
    const ctx = canvas.getContext("webgl2", {
      preserveDrawingBuffer: true,
      antialias: false,
      alpha: true,
      premultipliedAlpha: false,
    });
    if (!ctx) {
      throw new Error(
        "O navegador não deu um contexto WebGL2 para as partículas. No render, " +
          'isso costuma ser falta de `gl: "swangle"` nas opções do Chromium.',
      );
    }
    gl = ctx;
    contextos.set(canvas, gl);
  }

  const [largura, altura] = u.tamanho;
  if (canvas.width !== largura || canvas.height !== altura) {
    canvas.width = largura;
    canvas.height = altura;
  }

  const { programa, locais } = programaDe(gl);
  gl.useProgram(programa);
  gl.viewport(0, 0, largura, altura);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.uniform2f(locais.uTamanho ?? null, largura, altura);
  gl.uniform1f(locais.uMs ?? null, u.ms);
  gl.uniform1f(locais.uPulso ?? null, u.pulso);
  gl.uniform1i(locais.uModo ?? null, u.modo);
  gl.uniform1f(locais.uDensidade ?? null, u.densidade);
  gl.uniform1f(locais.uTamanhoP ?? null, u.tamanhoDaParticula);
  gl.uniform1f(locais.uVelocidade ?? null, u.velocidade);
  gl.uniform1f(locais.uOpacidade ?? null, u.opacidade);
  gl.uniform3f(locais.uCor ?? null, ...((u.cor ?? [1, 1, 1]) as [number, number, number]));
  gl.uniform1i(locais.uUsarCor ?? null, u.cor ? 1 : 0);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
