/** Conversão quadro↔ms e duração total. Puro, sem estado. */

/** Instante, em ms, do quadro `frame` a `fps` quadros por segundo. */
export function msDoQuadro(frame: number, fps: number): number {
  return (frame / fps) * 1000;
}

/** Quadro que contém o instante `ms`, arredondado para baixo. */
export function quadroDoMs(ms: number, fps: number): number {
  return Math.floor((ms / 1000) * fps);
}

/** Quadros necessários para cobrir `duracaoMs`, no mínimo 1. */
export function totalDeQuadros(duracaoMs: number, fps: number): number {
  return Math.max(1, Math.ceil((duracaoMs / 1000) * fps));
}
