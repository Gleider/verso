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

/** O trecho da música que vai virar vídeo. `fimMs` é exclusivo. */
export type Recorte = { inicioMs: number; fimMs: number };

/**
 * `true` se o recorte é usável.
 *
 * Um ramo de settings que chegou pela metade vira `NaN` e some do vídeo sem
 * erro nenhum (`pitfalls.md` §33) — aqui ele é barrado antes de virar quadro.
 */
export function recorteValido(recorte: Recorte | null | undefined): recorte is Recorte {
  if (!recorte) return false;
  const { inicioMs, fimMs } = recorte;
  return (
    Number.isFinite(inicioMs) && Number.isFinite(fimMs) && inicioMs >= 0 && fimMs > inicioMs
  );
}

/**
 * A janela `[primeiro, último]` de quadros do recorte, ou `null` para o vídeo
 * inteiro. Os dois extremos são INCLUSIVOS — é o que `frameRange` do
 * `renderMedia` e `inFrame`/`outFrame` do `<Player>` esperam.
 *
 * O recorte não muda a composição: ela continua sendo a faixa inteira, e o que
 * muda é a fatia de quadros pedida. Deslocar os versos e o áudio para o começo
 * do trecho recriaria, por outro caminho, a divergência entre preview e MP4 que
 * a composição única existe para eliminar — e o envelope da batida, que é
 * construído sempre do quadro 0 (`pitfalls.md` §17), sairia fora de fase.
 */
export function janelaDeQuadros(
  recorte: Recorte | null | undefined,
  duracaoMs: number,
  fps: number,
): [number, number] | null {
  if (!recorteValido(recorte)) return null;

  const ultimoDaFaixa = totalDeQuadros(duracaoMs, fps) - 1;
  const inicio = Math.min(Math.max(0, quadroDoMs(recorte.inicioMs, fps)), ultimoDaFaixa);
  // `fimMs` é exclusivo: o quadro que o contém já é o primeiro de fora.
  const fim = Math.min(Math.max(inicio, quadroDoMs(recorte.fimMs, fps) - 1), ultimoDaFaixa);
  return [inicio, fim];
}
