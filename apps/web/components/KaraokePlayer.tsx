"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, formatDuration } from "@/lib/api";
import { activeLineIndex, centerOffset, wordCursor } from "@/lib/sync";
import { timeSyllables } from "@/lib/syllables";
import { INITIAL_BEAT, stepBeat, visualState } from "@/lib/beat";
import { normalizeWords } from "@/lib/normalize";
import { DEFAULT_EFFECT, DEFAULT_INTENSITY, effectFrame } from "@/lib/effects";
import type { LyricLine, TrackDetail } from "@/lib/types";

const CONTROLS_HIDE_MS = 2600;
/** Passo do ajuste fino; com Shift o passo é maior. */
const OFFSET_STEP_MS = 100;
const OFFSET_STEP_COARSE_MS = 500;
const OFFSET_LIMIT_MS = 30_000;
/** Espera você parar de ajustar antes de gravar. */
const OFFSET_SAVE_DELAY_MS = 900;

interface Props {
  track: TrackDetail;
  lines: LyricLine[];
  /** Idioma da letra: muda as regras de silabificação. */
  lang?: string;
}

export function KaraokePlayer({ track, lines, lang = "pt" }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeIndex, setActiveIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);

  const [offsetMs, setOffsetMs] = useState(track.lyrics_offset_ms ?? 0);
  const [offsetSaved, setOffsetSaved] = useState(true);
  // O loop de sincronia lê o offset por ref: mudá-lo não deve recriar o rAF.
  const offsetRef = useRef(offsetMs);
  const offsetSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Ajuste manual por verso, somado ao timing medido.
   *
   * Negativo faz o verso entrar antes. Fica separado do dado do modelo para
   * ser reversível — e para o alinhamento da fase 2 poder corrigir os timings
   * originais sem apagar o que você acertou de ouvido.
   */
  const [nudges, setNudges] = useState<Record<string, number>>(() =>
    Object.fromEntries(lines.filter((l) => l.nudge_ms).map((l) => [l.id, l.nudge_ms])),
  );
  const [dirtyNudges, setDirtyNudges] = useState<Set<string>>(() => new Set());
  const [savingNudges, setSavingNudges] = useState(false);
  const [nudgeError, setNudgeError] = useState<string | null>(null);

  /** Os versos com o ajuste já aplicado — é o que a sincronia enxerga. */
  const effectiveLines = useMemo(
    () =>
      lines.map((line) => {
        // Sanear vem antes de tudo: timing inflado faz o destaque arrastar
        // sobre trecho em que ninguém está cantando.
        const words = normalizeWords(line.words);
        const nudge = nudges[line.id] ?? 0;
        if (!nudge) return words === line.words ? line : { ...line, words };
        return {
          ...line,
          start_ms: line.start_ms === null ? null : line.start_ms + nudge,
          end_ms: line.end_ms === null ? null : line.end_ms + nudge,
          words: words.map((word) => ({ ...word, s: word.s + nudge, e: word.e + nudge })),
        };
      }),
    [lines, nudges],
  );

  // Spans das sílabas do verso ativo. Só ele é quebrado: manter o resto da
  // letra como texto simples deixa o DOM leve numa letra longa.
  const syllableRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const lastSegmentIndex = useRef(-2);

  // --- imagem viva ---------------------------------------------------------
  const backdropRef = useRef<HTMLImageElement>(null);
  const chromaRef = useRef<HTMLImageElement>(null);
  const scanlinesRef = useRef<HTMLDivElement>(null);
  const noiseRef = useRef<HTMLDivElement>(null);
  const trackingRef = useRef<HTMLDivElement>(null);
  const effectRef = useRef(track.background_effect || DEFAULT_EFFECT);
  const intensityRef = useRef(track.effect_intensity ?? DEFAULT_INTENSITY);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // O buffer precisa ser respaldado por ArrayBuffer (não SharedArrayBuffer),
  // que é o que getByteFrequencyData aceita.
  const spectrumRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const beatRef = useRef(INITIAL_BEAT);

  /**
   * Liga o analisador ao áudio que já está tocando.
   *
   * Só pode ser feito depois de um gesto do usuário (política de autoplay) e
   * uma única vez por elemento. Se falhar — navegador antigo, áudio sem
   * permissão de leitura —, a imagem continua respirando, apenas sem pulsar.
   */
  const attachAnalyser = useCallback(() => {
    if (audioContextRef.current || !audioRef.current) return;
    try {
      const Context =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;

      const context = new Context();
      const source = context.createMediaElementSource(audioRef.current);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.65;

      source.connect(analyser);
      analyser.connect(context.destination);

      audioContextRef.current = context;
      analyserRef.current = analyser;
      spectrumRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    } catch {
      analyserRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      void audioContextRef.current?.close();
    },
    [],
  );

  /**
   * Move a imagem um quadro.
   *
   * A energia vem das primeiras faixas do espectro (graves, ~40–300 Hz), que é
   * onde bumbo e baixo marcam o tempo. Escrita direta no style: nenhuma destas
   * propriedades passa pelo React.
   */
  const paintBackdrop = useCallback((ms: number) => {
    const backdrop = backdropRef.current;
    if (!backdrop) return;

    const analyser = analyserRef.current;
    const spectrum = spectrumRef.current;

    if (analyser && spectrum) {
      analyser.getByteFrequencyData(spectrum);
      let sum = 0;
      for (let bin = 1; bin <= 6; bin += 1) sum += spectrum[bin];
      beatRef.current = stepBeat(beatRef.current, sum / 6 / 255);
    }

    const frame = effectFrame(
      effectRef.current,
      ms,
      beatRef.current.pulse,
      intensityRef.current,
    );

    backdrop.style.transform = frame.transform;
    backdrop.style.filter = frame.filter;

    if (chromaRef.current) {
      chromaRef.current.style.opacity = frame.chroma ? String(frame.chroma.opacity) : "0";
      if (frame.chroma) chromaRef.current.style.transform = frame.chroma.transform;
    }
    if (scanlinesRef.current) {
      scanlinesRef.current.style.opacity = String(frame.scanlines);
    }
    if (noiseRef.current) {
      noiseRef.current.style.opacity = String(frame.noise);
      if (frame.noise > 0) {
        // Deslocar a textura a cada quadro é o que faz o ruído chiar.
        const x = Math.floor(ms / 37) % 160;
        const y = Math.floor(ms / 23) % 160;
        noiseRef.current.style.backgroundPosition = `${x}px ${y}px`;
      }
    }
    if (trackingRef.current) {
      const glitch = frame.tracking;
      trackingRef.current.style.opacity = glitch ? "1" : "0";
      if (glitch) {
        trackingRef.current.style.top = `${glitch.y}%`;
        trackingRef.current.style.height = `${glitch.height}%`;
        trackingRef.current.style.transform = `translate3d(${glitch.shift}%, 0, 0)`;
      }
    }
  }, []);

  /**
   * O verso ativo, repartido em sílabas com tempo próprio.
   *
   * Recalculado só quando o verso muda — some do custo por quadro.
   */
  const activeWords = useMemo(() => {
    const line = effectiveLines[activeIndex];
    if (!line?.words?.length) return [];
    return line.words.map((word) => timeSyllables(word, lang));
  }, [effectiveLines, activeIndex, lang]);

  /** Os mesmos segmentos em lista plana, na ordem em que são cantados. */
  const activeSegments = useMemo(() => activeWords.flat(), [activeWords]);
  const segmentsRef = useRef(activeSegments);
  useEffect(() => {
    segmentsRef.current = activeSegments;
    lastSegmentIndex.current = -2;
  }, [activeSegments]);

  /**
   * Pinta o destaque dentro do verso, a cada quadro.
   *
   * O custo por quadro é uma escrita de propriedade CSS na sílaba atual. As
   * classes das demais só são mexidas quando a sílaba troca — algumas vezes
   * por segundo, não sessenta.
   */
  const paintSegments = useCallback((ms: number) => {
    const spans = syllableRefs.current;
    const segments = segmentsRef.current;
    if (spans.length === 0 || segments.length === 0) return;

    const { index, fill } = wordCursor(segments, ms);

    if (index !== lastSegmentIndex.current) {
      lastSegmentIndex.current = index;
      for (let i = 0; i < spans.length; i += 1) {
        const span = spans[i];
        if (!span) continue;
        span.className = i < index ? "kw kw-sung" : i === index ? "kw kw-now" : "kw";
        if (i !== index) span.style.removeProperty("--kw-fill");
      }
    }

    const current = spans[index];
    if (current) current.style.setProperty("--kw-fill", `${(fill * 100).toFixed(1)}%`);
  }, []);

  /**
   * A sincronia roda em requestAnimationFrame lendo o tempo real do áudio.
   * O evento `timeupdate` dispara só ~4x por segundo, o que faz a letra pular.
   *
   * Só mexemos no estado quando o verso muda; a barra de progresso é escrita
   * direto no style para não re-renderizar a lista 60 vezes por segundo.
   */
  useEffect(() => {
    let frame = 0;
    let lastIndex = -2;
    let lastSecond = -1;
    let lastMs = -1;
    // Relógio próprio da imagem: ela respira mesmo com a música parada.
    const startedAt = performance.now();

    const tick = () => {
      const audio = audioRef.current;
      // Com o áudio parado o tempo não anda: não há nada para repintar.
      if (audio && audio.currentTime !== lastMs) {
        lastMs = audio.currentTime;
        const ms = audio.currentTime * 1000;

        // Offset positivo adianta a letra: o verso acende antes do canto.
        const adjusted = ms + offsetRef.current;

        const index = activeLineIndex(effectiveLines, adjusted);
        if (index !== lastIndex) {
          lastIndex = index;
          lastSegmentIndex.current = -2; // o verso trocou: refaz o destaque do zero
          setActiveIndex(index);
        }

        paintSegments(adjusted);

        if (progressRef.current && audio.duration) {
          progressRef.current.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
        }

        const second = Math.floor(audio.currentTime);
        if (second !== lastSecond) {
          lastSecond = second;
          setElapsed(second * 1000);
        }
      }

      // Fora da guarda de propósito: a letra só muda quando o tempo anda, mas a
      // imagem precisa continuar se movendo mesmo com o áudio parado.
      paintBackdrop(performance.now() - startedAt);

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [effectiveLines, paintSegments, paintBackdrop]);

  /**
   * Mantém o verso aceso centralizado na tela.
   *
   * A medida de referência é a altura do viewport — a área visível —, nunca a
   * da lista de versos, que soma milhares de pixels e tiraria tudo da tela.
   * Antes do primeiro verso começar, centraliza no verso inicial para a letra
   * já nascer posicionada em vez de saltar no play.
   */
  useLayoutEffect(() => {
    // O verso novo pode ter menos sílabas que o anterior; sobras apontariam
    // para spans que já saíram da tela.
    syllableRefs.current.length = activeSegments.length;

    const list = listRef.current;
    const viewport = viewportRef.current;
    if (!list || !viewport) return;

    const target = activeRef.current ?? (list.firstElementChild as HTMLElement | null);
    if (!target) return;

    const offset = centerOffset(target.offsetTop, target.offsetHeight, viewport.clientHeight);
    list.style.transform = `translateY(${-offset}px)`;
  }, [activeIndex, activeSegments]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
  }, []);

  useEffect(() => {
    showControls();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [showControls]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }, []);

  const seekTo = useCallback((ms: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = ms / 1000;
  }, []);

  /**
   * Ajuste fino da letra, enquanto a música toca.
   *
   * O desalinhamento que se percebe assistindo é quase sempre constante — vem
   * da latência de decodificação e de um viés do modelo —, então um único
   * número conserta a faixa inteira. Grava sozinho depois que você para.
   */
  const adjustOffset = useCallback(
    (delta: number) => {
      setOffsetSaved(false);
      setOffsetMs((previous) => {
        const next = Math.max(-OFFSET_LIMIT_MS, Math.min(OFFSET_LIMIT_MS, previous + delta));
        offsetRef.current = next;

        if (offsetSaveTimer.current) clearTimeout(offsetSaveTimer.current);
        offsetSaveTimer.current = setTimeout(() => {
          api
            .setOffset(track.id, next)
            .then(() => setOffsetSaved(true))
            .catch(() => setOffsetSaved(false));
        }, OFFSET_SAVE_DELAY_MS);

        return next;
      });
      showControls();
    },
    [track.id, showControls],
  );

  useEffect(
    () => () => {
      if (offsetSaveTimer.current) clearTimeout(offsetSaveTimer.current);
    },
    [],
  );

  /** Tempo atual no relógio da letra (já com o offset global). */
  const lyricsNow = useCallback(
    () => (audioRef.current?.currentTime ?? 0) * 1000 + offsetRef.current,
    [],
  );

  /**
   * Move um verso no tempo. Com `cascade`, move também todos os seguintes.
   *
   * A cascata é o gesto que resolve o caso comum: a derrapagem começa num
   * ponto e segue dali. Corrigir verso a verso, numa letra inteira, seria
   * trabalho sem fim.
   */
  const adjustNudge = useCallback(
    (delta: number, { cascade = false }: { cascade?: boolean } = {}) => {
      if (activeIndex < 0) return;
      const alvos = cascade ? lines.slice(activeIndex) : [lines[activeIndex]];

      setNudges((previous) => {
        const next = { ...previous };
        for (const line of alvos) {
          const atual = next[line.id] ?? 0;
          next[line.id] = Math.max(-OFFSET_LIMIT_MS, Math.min(OFFSET_LIMIT_MS, atual + delta));
        }
        return next;
      });
      setDirtyNudges((previous) => {
        const next = new Set(previous);
        for (const line of alvos) next.add(line.id);
        return next;
      });
      setNudgeError(null);
      showControls();
    },
    [activeIndex, lines, showControls],
  );

  /** "Este verso começa agora": o jeito mais direto de acertar de ouvido. */
  const markNow = useCallback(() => {
    if (activeIndex < 0) return;
    const line = lines[activeIndex];
    if (line.start_ms === null) return;

    const alvo = Math.round(lyricsNow() - line.start_ms);
    setNudges((previous) => ({
      ...previous,
      [line.id]: Math.max(-OFFSET_LIMIT_MS, Math.min(OFFSET_LIMIT_MS, alvo)),
    }));
    setDirtyNudges((previous) => new Set(previous).add(line.id));
    setNudgeError(null);
    showControls();
  }, [activeIndex, lines, lyricsNow, showControls]);

  /**
   * Modo de marcação: você bate o ritmo junto com a música.
   *
   * É a forma mais rápida de consertar um trecho inteiro — em vez de ajustar
   * verso a verso em incrementos, você ouve e marca cada entrada no momento em
   * que ela acontece, e o avanço é automático.
   */
  const [tapMode, setTapMode] = useState(false);
  const [tapIndex, setTapIndex] = useState(0);

  const startTapping = useCallback(() => {
    setTapIndex(Math.max(0, activeIndex));
    setTapMode(true);
    showControls();
  }, [activeIndex, showControls]);

  const tapNow = useCallback(() => {
    const line = lines[tapIndex];
    if (!line) {
      setTapMode(false);
      return;
    }

    if (line.start_ms !== null) {
      const alvo = Math.round(lyricsNow() - line.start_ms);
      setNudges((previous) => ({
        ...previous,
        [line.id]: Math.max(-OFFSET_LIMIT_MS, Math.min(OFFSET_LIMIT_MS, alvo)),
      }));
      setDirtyNudges((previous) => new Set(previous).add(line.id));
    }

    // Terminou a letra: sai sozinho em vez de marcar no vazio.
    if (tapIndex + 1 >= lines.length) setTapMode(false);
    else setTapIndex(tapIndex + 1);
  }, [lines, tapIndex, lyricsNow]);

  /** Devolve o verso ao tempo que o modelo mediu. */
  const resetNudge = useCallback(() => {
    if (activeIndex < 0) return;
    const line = lines[activeIndex];
    setNudges((previous) => ({ ...previous, [line.id]: 0 }));
    setDirtyNudges((previous) => new Set(previous).add(line.id));
    showControls();
  }, [activeIndex, lines, showControls]);

  const persistNudges = useCallback(async () => {
    if (dirtyNudges.size === 0) return;
    setSavingNudges(true);
    setNudgeError(null);
    try {
      await api.saveNudges(
        track.id,
        [...dirtyNudges].map((id) => ({ line_id: id, nudge_ms: nudges[id] ?? 0 })),
      );
      setDirtyNudges(new Set());
    } catch (cause) {
      setNudgeError(
        cause instanceof Error ? cause.message : "Não foi possível salvar os ajustes.",
      );
    } finally {
      setSavingNudges(false);
    }
  }, [dirtyNudges, nudges, track.id]);

  // Ajuste feito de ouvido e não salvo é trabalho que não dá para refazer de cabeça.
  useEffect(() => {
    if (dirtyNudges.size === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyNudges]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      showControls();

      // No modo de marcação, o espaço marca — é a tecla que a mão já procura.
      if (tapMode) {
        if (event.code === "Space" || event.code === "Enter") {
          event.preventDefault();
          tapNow();
          return;
        }
        if (event.code === "Escape") {
          event.preventDefault();
          setTapMode(false);
          return;
        }
      }

      if (event.code === "Space") {
        event.preventDefault();
        toggle();
      } else if (event.code === "ArrowRight" && audioRef.current) {
        audioRef.current.currentTime += 5;
      } else if (event.code === "ArrowLeft" && audioRef.current) {
        audioRef.current.currentTime -= 5;
      } else if (event.key === "[" || event.key === "]") {
        // Teclas vizinhas: dá para calibrar de ouvido sem procurar no teclado.
        event.preventDefault();
        const step = event.shiftKey ? OFFSET_STEP_COARSE_MS : OFFSET_STEP_MS;
        adjustOffset(event.key === "]" ? step : -step);
      } else if (event.key === "0" && offsetRef.current !== 0) {
        event.preventDefault();
        adjustOffset(-offsetRef.current);
      } else if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        void persistNudges();
      } else if (event.key === "," || event.key === "<") {
        // Vírgula à esquerda atrasa; ponto à direita adianta. Com Shift, daqui em diante.
        event.preventDefault();
        adjustNudge(OFFSET_STEP_MS, { cascade: event.shiftKey });
      } else if (event.key === "." || event.key === ">") {
        event.preventDefault();
        adjustNudge(-OFFSET_STEP_MS, { cascade: event.shiftKey });
      } else if (event.key === "m" || event.key === "M") {
        event.preventDefault();
        markNow();
      } else if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        resetNudge();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    toggle,
    showControls,
    adjustOffset,
    adjustNudge,
    markNow,
    resetNudge,
    persistNudges,
    tapMode,
    tapNow,
  ]);

  const hasBackground = track.has_background;

  const overlay = hasBackground
    ? "linear-gradient(to right, rgba(8,14,16,.93) 0%, rgba(8,14,16,.74) 45%, rgba(8,14,16,.56) 100%)"
    : "radial-gradient(ellipse 120% 90%, #16242a 0%, #0c1316 72%)";

  return (
    <div
      onMouseMove={showControls}
      onTouchStart={showControls}
      className="fixed inset-0 overflow-hidden bg-ground"
    >
      {hasBackground && (
        // eslint-disable-next-line @next/next/no-img-element
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={backdropRef}
            src={api.backgroundUrl(track.id)}
            alt=""
            aria-hidden
            className="backdrop-live absolute inset-0 h-full w-full object-cover"
          />
          {/* Cópia deslocada: separa as cores nas bordas. Fica invisível
              (opacidade 0) nos efeitos que não a usam. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={chromaRef}
            src={api.backgroundUrl(track.id)}
            alt=""
            aria-hidden
            className="fx-layer fx-chroma"
            style={{ opacity: 0 }}
          />
          <div ref={scanlinesRef} aria-hidden className="fx-layer fx-scanlines" style={{ opacity: 0 }} />
          <div ref={noiseRef} aria-hidden className="fx-layer fx-noise" style={{ opacity: 0 }} />
          <div ref={trackingRef} aria-hidden className="fx-tracking" style={{ opacity: 0, top: 0, height: "6%" }} />
        </>
      )}

      {/* Garante contraste do texto sobre qualquer foto. */}
      <div aria-hidden className="absolute inset-0" style={{ background: overlay }} />

      <div className="relative flex h-full flex-col">
        <div ref={viewportRef} className="flex-1 overflow-hidden px-6 sm:px-12">
          <div
            ref={listRef}
            className="flex flex-col gap-5 py-[45vh] transition-transform duration-500 ease-out motion-reduce:transition-none"
          >
            {effectiveLines.map((line, index) => {
              const distance = Math.abs(index - activeIndex);
              const isActive = index === activeIndex;
              return (
                <button
                  key={line.id}
                  ref={isActive ? activeRef : undefined}
                  type="button"
                  onClick={() =>
                    tapMode ? tapNow() : line.start_ms !== null && seekTo(line.start_ms)
                  }
                  aria-current={isActive ? "true" : undefined}
                  className={`max-w-4xl text-left font-display font-bold leading-tight tracking-tight transition-all duration-300 motion-reduce:transition-none ${
                    isActive
                      ? "text-[clamp(1.7rem,4.4vw,3.1rem)] text-amber"
                      : "text-[clamp(1.1rem,2.4vw,1.7rem)] text-ink hover:text-ink-2"
                  }`}
                  style={{
                    opacity:
                      tapMode && index === tapIndex
                        ? 1
                        : isActive
                          ? 1
                          : Math.max(0.16, 0.62 - distance * 0.13),
                    filter: isActive || distance < 2 ? "none" : "blur(1.2px)",
                    boxShadow:
                      tapMode && index === tapIndex
                        ? "inset 0 -3px 0 0 var(--color-amber-bright)"
                        : undefined,
                  }}
                >
                  {isActive && activeWords.length > 0
                    ? (() => {
                        // Um índice corrido pelas sílabas do verso, na ordem do canto.
                        let at = 0;
                        return activeWords.map((syllables, wordIndex) => (
                          <span key={`${line.id}-${wordIndex}`}>
                            {syllables.map((syllable) => {
                              const position = at;
                              at += 1;
                              return (
                                <span
                                  key={position}
                                  ref={(element) => {
                                    syllableRefs.current[position] = element;
                                  }}
                                  className="kw"
                                >
                                  {syllable.text}
                                </span>
                              );
                            })}
                            {wordIndex < activeWords.length - 1 ? " " : ""}
                          </span>
                        ));
                      })()
                    : line.text}

                  {/* Um verso deslocado precisa dizer isso na cara: um ajuste
                      esquecido é pior que nenhum. */}
                  {(nudges[line.id] ?? 0) !== 0 && (
                    <span
                      className={`ml-3 align-middle font-mono text-[0.42em] tabular-nums ${
                        dirtyNudges.has(line.id) ? "text-amber-bright" : "text-ink-3"
                      }`}
                    >
                      {(-(nudges[line.id] ?? 0) / 1000).toFixed(1).replace("-", "−")}s
                      {dirtyNudges.has(line.id) ? " •" : ""}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className={`relative shrink-0 transition-opacity duration-300 ${
            controlsVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          {tapMode && (
            <div className="flex flex-wrap items-center gap-3 border-t border-amber bg-amber-soft px-6 py-3 sm:px-12">
              <button
                type="button"
                onClick={tapNow}
                className="border border-amber bg-amber px-5 py-2 font-display text-sm font-bold text-ground hover:bg-amber-bright"
              >
                marcar agora
              </button>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-2">
                verso {Math.min(tapIndex + 1, lines.length)} de {lines.length}
                {lines[tapIndex] ? ` · ${lines[tapIndex].text}` : ""}
              </span>
              <span className="hidden font-mono text-[11px] text-ink-3 md:inline">
                espaço marca e avança · esc encerra
              </span>
              <button
                type="button"
                onClick={() => setTapMode(false)}
                className="border border-line px-3 py-1.5 font-mono text-xs text-ink-2 hover:border-risk hover:text-risk"
              >
                encerrar
              </button>
            </div>
          )}

          {nudgeError && (
            <p
              role="alert"
              className="border-l-2 border-risk bg-surface px-4 py-2 font-mono text-xs text-risk"
            >
              {nudgeError}
            </p>
          )}

          <div className="h-[3px] w-full bg-white/10">
            <div ref={progressRef} className="h-full bg-amber" style={{ width: "0%" }} />
          </div>

          <div className="flex flex-wrap items-center gap-4 px-6 py-4 sm:px-12">
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? "pausar" : "tocar"}
              className="border border-amber bg-amber px-4 py-2 font-mono text-xs text-ground hover:bg-amber-bright"
            >
              {playing ? "pausar" : "tocar"}
            </button>

            <span className="font-mono text-xs tabular-nums text-ink-2">
              {formatDuration(elapsed)} / {formatDuration(track.duration_ms)}
            </span>

            <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-3">
              {track.title}
              {track.artist ? ` · ${track.artist}` : ""}
            </span>

            {/* Ajuste fino da letra. Fica visível para o valor nunca ser um mistério. */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => adjustOffset(-OFFSET_STEP_MS)}
                aria-label="atrasar a letra em 100 milissegundos"
                className="border border-line px-2 py-1 font-mono text-xs text-ink-2 hover:border-amber hover:text-amber"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => offsetMs !== 0 && adjustOffset(-offsetMs)}
                title={offsetMs === 0 ? "a letra está no tempo medido" : "voltar ao tempo medido"}
                className={`min-w-[104px] px-1 font-mono text-xs tabular-nums transition-colors ${
                  offsetMs === 0 ? "text-ink-3" : "text-amber hover:text-amber-bright"
                }`}
              >
                {offsetMs === 0
                  ? "letra no tempo"
                  : `letra ${offsetMs > 0 ? "+" : ""}${(offsetMs / 1000).toFixed(1)}s`}
                {!offsetSaved && offsetMs !== 0 ? " ·" : ""}
              </button>
              <button
                type="button"
                onClick={() => adjustOffset(OFFSET_STEP_MS)}
                aria-label="adiantar a letra em 100 milissegundos"
                className="border border-line px-2 py-1 font-mono text-xs text-ink-2 hover:border-amber hover:text-amber"
              >
                +
              </button>
            </div>

            <button
              type="button"
              onClick={tapMode ? () => setTapMode(false) : startTapping}
              title="marcar a entrada de cada verso batendo junto com a música"
              className={`border px-3 py-2 font-mono text-xs transition-colors ${
                tapMode
                  ? "border-amber bg-amber text-ground"
                  : "border-line text-ink-2 hover:border-amber hover:text-amber"
              }`}
            >
              {tapMode ? "marcando…" : "marcar no ritmo"}
            </button>

            <button
              type="button"
              onClick={() => void persistNudges()}
              disabled={dirtyNudges.size === 0 || savingNudges}
              className={`border px-3 py-2 font-mono text-xs transition-colors ${
                dirtyNudges.size > 0
                  ? "border-amber bg-amber text-ground hover:bg-amber-bright"
                  : "border-line text-ink-3"
              } disabled:cursor-default`}
            >
              {savingNudges
                ? "salvando…"
                : dirtyNudges.size > 0
                  ? `salvar ${dirtyNudges.size} ajuste${dirtyNudges.size > 1 ? "s" : ""}`
                  : "ajustes salvos"}
            </button>

            <span className="hidden font-mono text-[11px] text-ink-3 xl:inline">
              [ ] tempo geral · , . este verso · shift daqui em diante · M marca agora · R zera
            </span>

            <Link
              href={`/track/${track.id}`}
              className="border border-line px-3 py-2 font-mono text-xs text-ink-2 hover:border-amber hover:text-amber"
            >
              sair
            </Link>
          </div>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={api.audioUrl(track.id)}
        preload="auto"
        crossOrigin="anonymous"
        onPlay={() => {
          setPlaying(true);
          attachAnalyser();
          void audioContextRef.current?.resume();
        }}
        onPause={() => setPlaying(false)}
      />
    </div>
  );
}
