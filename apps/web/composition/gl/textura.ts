/**
 * A imagem de fundo como textura de GPU.
 *
 * Carregada e enviada UMA vez por `src`, não por quadro. Era esse o custo
 * escondido do modelo anterior: cada passe fazia `texImage2D` do canvas
 * anterior, uma cópia de 2 MP por passe por quadro.
 */
import { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";

type Enviada = { textura: WebGLTexture; largura: number; altura: number };

const cachePorContexto = new WeakMap<WebGL2RenderingContext, Map<string, Enviada>>();

/**
 * Carrega a imagem e segura o render até ela estar pronta.
 *
 * `delayRender` aqui é legítimo e barato: dispara uma vez por `src`, não a
 * cada quadro. Sem ele o quadro 0 sairia sem fundo, e só no MP4.
 */
export function useImagemDeFundo(src: string | null): HTMLImageElement | null {
  const [imagem, setImagem] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImagem(null);
      return;
    }
    const espera = delayRender(`Carregando o fundo do vídeo: ${src}`);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImagem(img);
      continueRender(espera);
    };
    img.onerror = () => {
      cancelRender(new Error(`Não foi possível carregar a imagem de fundo: ${src}`));
    };
    img.src = src;
    return () => continueRender(espera);
  }, [src]);

  return imagem;
}

/** Envia a imagem para a GPU na primeira vez e reusa depois. */
export function texturaDe(gl: WebGL2RenderingContext, img: HTMLImageElement): Enviada {
  let cache = cachePorContexto.get(gl);
  if (!cache) {
    cache = new Map();
    cachePorContexto.set(gl, cache);
  }
  const existente = cache.get(img.src);
  if (existente) return existente;

  const textura = gl.createTexture();
  if (!textura) throw new Error("Não foi possível criar a textura do fundo.");
  gl.bindTexture(gl.TEXTURE_2D, textura);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  // CLAMP e LINEAR: a imagem é enquadrada em "cover" no shader, então
  // repetição só produziria costura nas bordas.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const enviada = { textura, largura: img.naturalWidth, altura: img.naturalHeight };
  cache.set(img.src, enviada);
  return enviada;
}
