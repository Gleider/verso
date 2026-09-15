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
import { construirAnalise } from "./envelope";
import type { AnaliseDeAudio } from "./envelope";

/**
 * 16kHz, não o padrão de 48kHz: uma faixa de 3min30 estéreo decodificada a
 * 48kHz são ~80MB de forma de onda POR ABA do Chromium; a 16kHz são ~27MB.
 * Nyquist a 8kHz é folgado para a banda de 40–330Hz que interessa, e a
 * largura de bin resultante é melhor que a do AnalyserNode de hoje.
 */
export const TAXA_DE_ANALISE = 16_000;

/**
 * Pulso da batida E espectro por quadro, ou `null` enquanto o áudio não
 * decodificou.
 *
 * Um hook só para os dois porque saem da MESMA FFT: o visualizador não custa
 * análise nenhuma além do que o pulso já pagava. E porque a regra dura acima
 * exige um único chamador de `useAudioData` — um segundo hook para o espectro
 * fixaria a taxa de amostragem errada para quem chamasse depois.
 */
export function useAnaliseDeAudio(
  src: string,
  fps: number,
  duracaoMs: number,
): AnaliseDeAudio | null {
  const dados = useAudioData(src, { sampleRate: TAXA_DE_ANALISE });
  return useMemo(
    () => (dados ? construirAnalise(dados, fps, duracaoMs) : null),
    [dados, fps, duracaoMs],
  );
}
