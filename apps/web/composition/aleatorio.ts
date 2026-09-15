/**
 * Ruído determinístico: mesma entrada, mesma saída, sempre.
 *
 * É a única fonte de "aleatoriedade" permitida sob `composition/`. O Remotion
 * renderiza quadros fora de ordem e em processos paralelos — `Math.random()`
 * daria um valor diferente por processo e o vídeo sairia incoerente de um
 * quadro para o outro, sem erro nenhum.
 *
 * Mesma função de `lib/effects.ts`, duplicada de propósito: aquele módulo é do
 * player e importá-lo aqui arrastaria o resto dele para dentro do bundle da
 * composição.
 */
export function hash(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
