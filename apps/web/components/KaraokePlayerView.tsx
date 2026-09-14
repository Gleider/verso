"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { Karaoke } from "@/composition/Karaoke";
import { dimensoesDaSaida } from "@/composition/formato";
import { totalDeQuadros } from "@/composition/tempo";
import { prepararVersos } from "@/composition/versos";
import type { KaraokeProps } from "@/composition/props";
import { api } from "@/lib/api";
import type { LyricLine, TrackDetail, VideoSettings } from "@/lib/types";

const OFFSET_STEP_MS = 100;
const OFFSET_STEP_COARSE_MS = 500;
const OFFSET_SAVE_DELAY_MS = 900;

interface Props {
  track: TrackDetail;
  lines: LyricLine[];
  lang: string;
  settings: VideoSettings;
  backgroundUrl: string | null;
}

/**
 * O player em tela cheia, montando a MESMA composição do editor e do render.
 *
 * O que é exclusivo desta tela — o ajuste fino de offset — fica FORA da
 * composição, ao redor do `<Player>`: é interface de edição de tempo, não
 * parte do desenho do vídeo. `prepararVersos` é a mesma função do editor;
 * ajustar o offset só troca o argumento que ela recebe.
 *
 * Escopo desta migração: o ajuste POR VERSO (`nudge_ms`) e a lista completa
 * de versos com rolagem, que o player anterior tinha, não migraram para cá —
 * ficam como um acréscimo futuro. O ajuste de offset da faixa inteira, que é
 * o mais usado, está aqui.
 */
export function KaraokePlayerView({ track, lines, lang, settings, backgroundUrl }: Props) {
  const [offsetMs, setOffsetMs] = useState(track.lyrics_offset_ms ?? 0);
  const [salvo, setSalvo] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const versos = useMemo(() => prepararVersos(lines, offsetMs, lang), [lines, offsetMs, lang]);

  const persistirOffset = useCallback(
    (proximo: number) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSalvo(false);
      saveTimer.current = setTimeout(() => {
        api
          .setOffset(track.id, proximo)
          .then(() => setSalvo(true))
          .catch(() => setSalvo(true));
      }, OFFSET_SAVE_DELAY_MS);
    },
    [track.id],
  );

  function ajustar(delta: number) {
    setOffsetMs((atual) => {
      const proximo = atual + delta;
      persistirOffset(proximo);
      return proximo;
    });
  }

  const { width, height } = dimensoesDaSaida(settings);
  const audioUrl = api.audioUrl(track.id, track.has_vocals_stem);
  const duracaoMs = track.duration_ms ?? 0;

  const karaokeProps: KaraokeProps = { settings, versos, duracaoMs, audioUrl, backgroundUrl };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full max-w-4xl">
        <Player
          component={Karaoke}
          inputProps={karaokeProps}
          compositionWidth={width}
          compositionHeight={height}
          fps={settings.output.fps}
          durationInFrames={totalDeQuadros(duracaoMs, settings.output.fps)}
          controls
          spaceKeyToPlayOrPause
          acknowledgeRemotionLicense
          style={{ width: "100%" }}
        />
      </div>

      <div className="flex items-center gap-3 font-mono text-xs text-ink-2">
        <span className="uppercase tracking-[0.14em] text-ink-3">ajuste fino da letra</span>
        <button
          type="button"
          onClick={() => ajustar(-OFFSET_STEP_COARSE_MS)}
          className="border border-line px-2 py-1 hover:border-amber hover:text-amber"
        >
          −500ms
        </button>
        <button
          type="button"
          onClick={() => ajustar(-OFFSET_STEP_MS)}
          className="border border-line px-2 py-1 hover:border-amber hover:text-amber"
        >
          −100ms
        </button>
        <span className="w-20 text-center tabular-nums text-amber">{offsetMs}ms</span>
        <button
          type="button"
          onClick={() => ajustar(OFFSET_STEP_MS)}
          className="border border-line px-2 py-1 hover:border-amber hover:text-amber"
        >
          +100ms
        </button>
        <button
          type="button"
          onClick={() => ajustar(OFFSET_STEP_COARSE_MS)}
          className="border border-line px-2 py-1 hover:border-amber hover:text-amber"
        >
          +500ms
        </button>
        {!salvo && <span className="text-ink-3">salvando…</span>}
      </div>
    </div>
  );
}
