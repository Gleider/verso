/**
 * Ruído determinístico: mesma entrada, mesma saída.
 *
 * Mesma fórmula de `lib/effects.ts` (não exportada de lá — é um detalhe de
 * implementação daquele módulo, não uma API pública dele). Determinismo
 * importa em dobro aqui: o Remotion renderiza quadros fora de ordem e em
 * processos paralelos, e `Math.random` produziria um vídeo diferente a cada
 * render.
 */
export function hash(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
