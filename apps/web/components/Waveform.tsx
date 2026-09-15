"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

type Instancia = {
  destroy: () => void;
  playPause: () => void;
  setTime: (s: number) => void;
  setMuted: (mudo: boolean) => void;
};

export type WaveformHandle = {
  /** Move o cursor sem passar pelo React — é chamado a cada quadro. */
  irPara: (ms: number) => void;
};

interface WaveformProps {
  src: string;
  onTimeUpdate?: (ms: number) => void;
  seekToMs?: number | null;
  /**
   * Modo controlado: o áudio toca em OUTRO lugar (o `<Player>` do editor) e
   * esta onda é só régua e cursor.
   *
   * Sem isso havia DOIS tocadores do mesmo arquivo na mesma tela, cada um com
   * o seu relógio — era essa a "posição do player desconectada da forma de
   * onda". Aqui a onda fica muda e sem botão próprio: uma origem de tempo só.
   */
  controlado?: boolean;
  onSeekMs?: (ms: number) => void;
}

/** Forma de onda com clique para buscar. Usa o stem vocal quando ele existe. */
export const Waveform = forwardRef<WaveformHandle, WaveformProps>(function Waveform(
  { src, onTimeUpdate, seekToMs, controlado = false, onSeekMs },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<Instancia | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);

  // Em refs, não em dependências do efeito: trocar a função não pode
  // reconstruir a onda inteira (e recarregar o áudio) no meio da reprodução.
  const aoTempo = useRef(onTimeUpdate);
  aoTempo.current = onTimeUpdate;
  const aoBuscar = useRef(onSeekMs);
  aoBuscar.current = onSeekMs;

  useImperativeHandle(
    ref,
    () => ({
      irPara(ms: number) {
        waveRef.current?.setTime(ms / 1000);
      },
    }),
    [],
  );

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

      wave.on("ready", () => {
        setReady(true);
        if (controlado) wave.setMuted(true);
      });
      wave.on("play", () => setPlaying(true));
      wave.on("pause", () => setPlaying(false));
      wave.on("timeupdate", (seconds: number) => {
        if (!controlado) aoTempo.current?.(Math.round(seconds * 1000));
      });
      wave.on("interaction", (seconds: number) => {
        if (controlado) aoBuscar.current?.(Math.round(seconds * 1000));
      });

      waveRef.current = wave as unknown as Instancia;
    }

    void boot();
    return () => {
      cancelled = true;
      waveRef.current?.destroy();
      waveRef.current = null;
    };
  }, [src, controlado]);

  useEffect(() => {
    if (seekToMs !== null && seekToMs !== undefined && waveRef.current) {
      waveRef.current.setTime(seekToMs / 1000);
    }
  }, [seekToMs]);

  return (
    <div className="flex flex-col gap-3">
      <div ref={containerRef} className="w-full" />
      {controlado ? (
        <span className="font-mono text-[11px] text-ink-3">
          {ready ? "clique na onda para posicionar o preview" : "carregando áudio…"}
        </span>
      ) : (
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
      )}
    </div>
  );
});
