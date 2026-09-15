/**
 * Um contexto, um quad, um `drawArrays`. O modelo do Godot.
 *
 * O que substituímos: `@remotion/effects` dava um canvas POR EFEITO, em
 * ping-pong, cada passe fazendo `texImage2D` do canvas anterior — medido em
 * ~7 ms por passe, linear no número de passes. Aqui todos os efeitos vivem no
 * mesmo `main()` e o desenho é síncrono.
 *
 * `preserveDrawingBuffer: true` NÃO é opcional: sem ele o `renderMedia`
 * captura quadros em branco, e só no render — o preview fica perfeito.
 */
import { programaPara } from "./programa";
import { texturaDe } from "./textura";
import type { Combinacao } from "./fonte";
import type { Uniformes } from "./uniformes";

const contextos = new WeakMap<HTMLCanvasElement, WebGL2RenderingContext>();

export function contextoDe(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const existente = contextos.get(canvas);
  if (existente) return existente;
  const gl = canvas.getContext("webgl2", {
    preserveDrawingBuffer: true,
    antialias: false,
    alpha: false,
    premultipliedAlpha: false,
    desynchronized: false,
  });
  if (!gl) {
    throw new Error(
      "O navegador não deu um contexto WebGL2 para o vídeo. No render, isso costuma " +
        'ser falta de `gl: "swangle"` nas opções do Chromium.',
    );
  }
  contextos.set(canvas, gl);
  return gl;
}

export function desenhar({
  canvas,
  combinacao,
  uniformes,
  imagem,
}: {
  canvas: HTMLCanvasElement;
  combinacao: Combinacao;
  uniformes: Uniformes;
  imagem: HTMLImageElement | null;
}): void {
  const gl = contextoDe(canvas);
  const [largura, altura] = uniformes.tamanho;
  if (canvas.width !== largura || canvas.height !== altura) {
    canvas.width = largura;
    canvas.height = altura;
  }

  const { programa, locais } = programaPara(gl, combinacao);
  gl.useProgram(programa);
  gl.viewport(0, 0, largura, altura);

  gl.uniform2f(locais.uTamanho ?? null, largura, altura);
  gl.uniform1f(locais.uMs ?? null, uniformes.ms);
  gl.uniform1f(locais.uPulso ?? null, uniformes.pulso);
  gl.uniform1f(locais.uAmbiente ?? null, uniformes.ambiente);
  gl.uniform1f(locais.uIntensidade ?? null, uniformes.intensidade);
  gl.uniform3f(locais.uCor ?? null, ...(uniformes.cor as [number, number, number]));

  if (combinacao.temImagem && imagem) {
    const { textura, largura: lw, altura: lh } = texturaDe(gl, imagem);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textura);
    gl.uniform1i(locais.uImagem ?? null, 0);
    gl.uniform2f(locais.uTamanhoImagem ?? null, lw, lh);
  } else {
    gl.uniform2f(locais.uTamanhoImagem ?? null, 1, 1);
  }

  // Sem VAO e sem buffer: o vértice vem de `gl_VertexID` no shader.
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
