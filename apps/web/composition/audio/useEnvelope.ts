/**
 * Ponte entre o áudio decodificado e o envelope de batida.
 *
 * REGRA DURA: este é o único lugar do repositório que chama
 * `useAudioData`/`getAudioData`. O cache interno do Remotion é indexado só
 * pelo `src`, ignorando as opções (`sampleRate` incluído) — quem chamar
 * primeiro para uma URL fixa a taxa de amostragem para todo o resto da
 * sessão. Se outro ponto do app chamasse `useAudioData(url)` sem opções antes
 * deste hook, o envelope receberia 48kHz e os índices de banda de
 * `indicesDaBanda` mudariam sem erro nenhum.
 */
import { useMemo } from "react";
import { useAudioData } from "@remotion/media-utils";
import { construirEnvelopeDeBatida } from "./envelope";

/**
 * 16kHz, não o padrão de 48kHz: uma faixa de 3min30 estéreo decodificada a
 * 48kHz são ~80MB de forma de onda POR ABA do Chromium; a 16kHz são ~27MB.
 * Nyquist a 8kHz é folgado para a banda de 40–330Hz que interessa, e a
 * largura de bin resultante é melhor que a do AnalyserNode de hoje.
 */
export const TAXA_DE_ANALISE = 16_000;

/** O pulso da batida por quadro, ou `null` enquanto o áudio não decodificou. */
export function useEnvelopeDeBatida(
  src: string,
  fps: number,
  duracaoMs: number,
): Float32Array | null {
  const dados = useAudioData(src, { sampleRate: TAXA_DE_ANALISE });
  return useMemo(
    () => (dados ? construirEnvelopeDeBatida(dados, fps, duracaoMs) : null),
    [dados, fps, duracaoMs],
  );
}
