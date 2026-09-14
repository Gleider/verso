"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { VideoExport } from "@/components/VideoExport";
import { LyricsEditor } from "@/components/LyricsEditor";
import { LyricsSourcePicker } from "@/components/LyricsSourcePicker";
import { ProcessingStatus } from "@/components/ProcessingStatus";
import { Waveform } from "@/components/Waveform";
import { api, formatDuration } from "@/lib/api";
import type { LyricsVersion, TrackDetail } from "@/lib/types";

export function TrackWorkspace({ track }: { track: TrackDetail }) {
  const [version, setVersion] = useState<LyricsVersion | null>(track.active_lyrics);
  const [currentMs, setCurrentMs] = useState(0);
  const [seekToMs, setSeekToMs] = useState<number | null>(null);

  const handleSeek = useCallback((ms: number) => {
    // Nudge para o efeito disparar mesmo ao clicar duas vezes no mesmo verso.
    setSeekToMs(ms);
    setCurrentMs(ms);
  }, []);

  const ready = track.state === "ready" && version !== null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/" className="font-mono text-[11px] text-ink-3 hover:text-amber">
          ← biblioteca
        </Link>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">{track.title}</h1>
        <p className="font-mono text-xs text-ink-3">
          {track.artist ?? "artista desconhecido"} · {formatDuration(track.duration_ms)}
          {track.has_vocals_stem ? " · stem vocal disponível" : ""}
        </p>
      </header>

      {!ready ? (
        track.state === "uploaded" && version === null ? (
          // Faixa salva sem origem de letra (ex.: upload interrompido ou
          // Musixmatch que ainda não foi buscado) — deixa escolher de novo.
          <LyricsSourcePicker
            trackId={track.id}
            initialTitle={track.title}
            initialArtist={track.artist}
            onDone={() => window.location.reload()}
          />
        ) : (
          <ProcessingStatus trackId={track.id} initialJob={track.latest_job} />
        )
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <section className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
              {track.has_vocals_stem ? "forma de onda · stem vocal" : "forma de onda"}
            </h2>
            <Waveform
              src={api.audioUrl(track.id, track.has_vocals_stem)}
              onTimeUpdate={setCurrentMs}
              seekToMs={seekToMs}
            />
            <VideoExport trackId={track.id} disabled={!ready} />

            <div className="flex flex-wrap gap-2 pt-2">
              <Link
                href={`/track/${track.id}/video`}
                className="border border-amber bg-amber px-3 py-1.5 font-mono text-xs text-ground transition-colors hover:bg-amber-bright"
              >
                editar vídeo
              </Link>
              <Link
                href={`/track/${track.id}/play`}
                className="border border-line px-3 py-1.5 font-mono text-xs text-ink-2 transition-colors hover:border-amber hover:text-amber"
              >
                abrir o player
              </Link>
              <a
                href={api.exportUrl(track.id, "lrc")}
                className="border border-line px-3 py-1.5 font-mono text-xs text-ink-2 transition-colors hover:border-amber hover:text-amber"
              >
                exportar .lrc
              </a>
              <a
                href={api.exportUrl(track.id, "txt")}
                className="border border-line px-3 py-1.5 font-mono text-xs text-ink-2 transition-colors hover:border-amber hover:text-amber"
              >
                exportar .txt
              </a>
              <button
                type="button"
                onClick={() => void api.retranscribe(track.id).then(() => window.location.reload())}
                className="border border-line px-3 py-1.5 font-mono text-xs text-ink-2 transition-colors hover:border-amber hover:text-amber"
              >
                reprocessar
              </button>
            </div>
          </section>

          <LyricsEditor
            trackId={track.id}
            version={version}
            currentMs={currentMs}
            onSeek={handleSeek}
            onSaved={setVersion}
          />
        </div>
      )}
    </div>
  );
}
