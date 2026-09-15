/**
 * Pedaços de GLSL compartilhados: ruído, matemática e amostragem.
 *
 * GLSL mora em constante de TypeScript, não em arquivo `.glsl`, porque o
 * bundler do Remotion é webpack próprio e não tem loader para isso — um
 * `import "./x.glsl"` compilaria no Next e quebraria só no primeiro render.
 *
 * Tudo aqui é função pura do tempo: a mesma regra de `composition/`, agora na
 * GPU. Nada de `fract(sin(...))` alimentado por relógio de parede.
 */

/**
 * Hash e ruído.
 *
 * NÃO use `fract(sin(x) * 43758.5453)`, o hash de sempre dos exemplos: em
 * `highp` de ANGLE ele perde precisão e o ruído sai em RETÂNGULOS de borda
 * dura — foi exatamente o que apareceu no primeiro render da aurora, e não é
 * compressão (reproduz igual em crf 8). O hash abaixo é aritmética de ponto
 * flutuante sem transcendental, e não tem esse colapso.
 */
export const RUIDO = /* glsl */ `
float hash11(float n) {
  float p = fract(n * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 v) {
  vec3 p = fract(vec3(v.xyx) * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

/** Ruído de valor com interpolação suave — a base do fbm. */
float ruido(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/** Quatro oitavas bastam para nuvem e aurora; mais que isso não se vê. */
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * ruido(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return v;
}
`;

/** Conversões de cor e utilidades de enquadramento. */
export const CORES = /* glsl */ `
float luminancia(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

/**
 * UV corrigido pela proporção, com origem no centro.
 *
 * Sem isto, todo padrão radial (anéis, raios, vinheta) sai OVAL em 16:9 —
 * é o defeito clássico de quem desenha em UV cru.
 */
vec2 centrado(vec2 uv, vec2 tamanho) {
  vec2 p = uv - 0.5;
  p.x *= tamanho.x / tamanho.y;
  return p;
}
`;
