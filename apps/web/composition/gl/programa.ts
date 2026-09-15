/**
 * Compila e guarda os programas GLSL.
 *
 * Cacheado por contexto e por chave de combinação: trocar de textura no painel
 * compila uma vez e reusa daí em diante. Sem o cache, cada mudança de quadro
 * recompilaria — e compilar shader é caríssimo, na casa de dezenas de ms.
 */
import { chaveDaCombinacao, montarFragmento, VERTEX, type Combinacao } from "./fonte";

export type ProgramaCompilado = {
  programa: WebGLProgram;
  /** Localizações resolvidas uma vez: `getUniformLocation` por quadro é lento. */
  locais: Record<string, WebGLUniformLocation | null>;
};

const UNIFORMES = [
  "uTamanho",
  "uMs",
  "uPulso",
  "uAmbiente",
  "uIntensidade",
  "uCor",
  "uImagem",
  "uTamanhoImagem",
] as const;

const cachePorContexto = new WeakMap<WebGL2RenderingContext, Map<string, ProgramaCompilado>>();

function compilar(gl: WebGL2RenderingContext, tipo: number, fonte: string): WebGLShader {
  const shader = gl.createShader(tipo);
  if (!shader) throw new Error("Não foi possível criar o shader.");
  gl.shaderSource(shader, fonte);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "(sem log)";
    gl.deleteShader(shader);
    // A mensagem traz o log do compilador: sem ele, um erro de GLSL vira
    // "tela preta" e não há onde procurar.
    throw new Error(`Falha ao compilar o shader do vídeo:\n${log}`);
  }
  return shader;
}

export function programaPara(gl: WebGL2RenderingContext, c: Combinacao): ProgramaCompilado {
  let cache = cachePorContexto.get(gl);
  if (!cache) {
    cache = new Map();
    cachePorContexto.set(gl, cache);
  }
  const chave = chaveDaCombinacao(c);
  const existente = cache.get(chave);
  if (existente) return existente;

  const vs = compilar(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compilar(gl, gl.FRAGMENT_SHADER, montarFragmento(c));
  const programa = gl.createProgram();
  if (!programa) throw new Error("Não foi possível criar o programa de shader.");
  gl.attachShader(programa, vs);
  gl.attachShader(programa, fs);
  gl.linkProgram(programa);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(programa) ?? "(sem log)";
    throw new Error(`Falha ao ligar o programa de shader do vídeo:\n${log}`);
  }

  const locais: ProgramaCompilado["locais"] = {};
  for (const nome of UNIFORMES) locais[nome] = gl.getUniformLocation(programa, nome);

  const compilado = { programa, locais };
  cache.set(chave, compilado);
  return compilado;
}
