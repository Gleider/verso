"use client";

import { useEffect, useRef, useState } from "react";

interface WaveformProps {
  src: string;
  onTimeUpdate?: (ms: number) => void;
  seekToMs?: number | null;
}

/** Forma de onda com clique para buscar. Usa o stem vocal quando ele existe. */
export function Waveform({ src, onTimeUpdate, seekToMs }: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<{ destroy: () => void; playPause: () => void; setTime: (s: number) => void } | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!containerRef.current) return;
      const { default: WaveSurfer } = await import("wavesurfer.js");
      if (cancelled || !containerRef.current) return;

      const wave = WaveSurfer.create({
        container: containerRef.current,
        height: 88,
        waveColor: "#2c4148",
        progressColor: "#e8a33d",
        cursorColor: "#f5b959",
        cursorWidth: 1,
        barWidth: 2,
        barGap: 1,
        normalize: true,
        url: src,
      });

      wave.on("ready", () => setReady(true));
      wave.on("play", () => setPlaying(true));
      wave.on("pause", () => setPlaying(false));
      wave.on("timeupdate", (seconds: number) => onTimeUpdate?.(Math.round(seconds * 1000)));

      waveRef.current = wave as unknown as typeof waveRef.current;
    }

    void boot();
    return () => {
      cancelled = true;
      waveRef.current?.destroy();
      waveRef.current = null;
    };
  }, [src, onTimeUpdate]);

  useEffect(() => {
    if (seekToMs !== null && seekToMs !== undefined && waveRef.current) {
      waveRef.current.setTime(seekToMs / 1000);
    }
  }, [seekToMs]);

  return (
    <div className="flex flex-col gap-3">
      <div ref={containerRef} className="w-full" />
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!ready}
          onClick={() => waveRef.current?.playPause()}
          className="border border-line px-3 py-1.5 font-mono text-xs text-ink-2 transition-colors hover:border-amber hover:text-amber disabled:opacity-40"
        >
          {playing ? "pausar" : "tocar"}
        </button>
        <span className="font-mono text-[11px] text-ink-3">
          {ready ? "clique na onda para buscar" : "carregando áudio…"}
        </span>
      </div>
    </div>
  );
}
