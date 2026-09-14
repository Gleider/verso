"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatTimecode } from "@/lib/api";
import type { LyricsVersion, WordTiming } from "@/lib/types";

const LOW_CONFIDENCE = 0.5;

interface Props {
  trackId: string;
  version: LyricsVersion;
  currentMs: number;
  onSeek: (ms: number) => void;
  onSaved: (version: LyricsVersion) => void;
}

/**
 * Uma palavra que o modelo não teve certeza fica marcada: é por onde começar.
 *
 * `reviewed` desliga a marcação: depois que um humano validou a linha, a
 * incerteza do modelo sobre ela não interessa mais.
 */
function Words({ words, reviewed }: { words: WordTiming[]; reviewed: boolean }) {
  return (
    <>
      {words.map((word, index) => {
        const uncertain = !reviewed && word.p < LOW_CONFIDENCE;
        return (
          <span
            key={`${word.s}-${index}`}
            className={uncertain ? "low-confidence" : undefined}
            title={uncertain ? `confiança ${word.p.toFixed(2)}` : undefined}
          >
            {word.w}
            {index < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </>
  );
}

export function LyricsEditor({ trackId, version, currentMs, onSeek, onSaved }: Props) {
  const [mode, setMode] = useState<"lines" | "paste">("lines");
  const [lines, setLines] = useState<string[]>(() => version.lines.map((line) => line.text));
  const [pasted, setPasted] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  // Linhas confirmadas à mão nesta sessão ("ouvi, está certo") — sem digitar nada.
  const [confirmed, setConfirmed] = useState<Set<number>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLines(version.lines.map((line) => line.text));
    setConfirmed(new Set());
  }, [version]);

  /** Uma linha está revisada se veio assim do servidor ou se você confirmou agora. */
  const isReviewed = useCallback(
    (index: number) => version.lines[index]?.reviewed || confirmed.has(index),
    [version.lines, confirmed],
  );

  const dirty = useMemo(
    () => lines.some((text, index) => text !== version.lines[index]?.text)
      || lines.length !== version.lines.length,
    [lines, version.lines],
  );

  /** O verso que está tocando agora. */
  const activeIndex = useMemo(() => {
    for (let index = version.lines.length - 1; index >= 0; index -= 1) {
      const line = version.lines[index];
      if (line.start_ms !== null && currentMs >= line.start_ms) return index;
    }
    return -1;
  }, [currentMs, version.lines]);

  /** Só conta o que ainda ninguém olhou; linha revisada sai da lista de pendências. */
  const lowConfidenceCount = useMemo(
    () =>
      version.lines.reduce(
        (total, line, index) =>
          isReviewed(index)
            ? total
            : total + line.words.filter((word) => word.p < LOW_CONFIDENCE).length,
        0,
      ),
    [version.lines, isReviewed],
  );

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const saved =
        mode === "paste"
          ? await api.importLyrics(trackId, pasted)
          : await api.saveLyrics(
              trackId,
              lines,
              lines.map((_, index) => isReviewed(index)),
            );
      onSaved(saved);
      setMode("lines");
      setPasted("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }, [mode, pasted, lines, trackId, onSaved, isReviewed]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        void save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-lg font-semibold tracking-tight">Letra</h2>
          <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
            v{version.version_no} ·{" "}
            {version.source === "asr"
              ? "gerada"
              : version.source === "imported"
                ? "importada"
                : version.source === "musixmatch"
                  ? "musixmatch"
                  : "editada"}
            {version.language ? ` · ${version.language}` : ""}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode(mode === "lines" ? "paste" : "lines")}
            className="border border-line px-3 py-1.5 font-mono text-xs text-ink-2 transition-colors hover:border-amber hover:text-amber"
          >
            {mode === "lines" ? "colar letra pronta" : "voltar à edição"}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || (mode === "lines" && !dirty) || (mode === "paste" && !pasted.trim())}
            className="border border-amber bg-amber px-3 py-1.5 font-mono text-xs text-ground transition-colors hover:bg-amber-bright disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "salvando…" : `salvar como v${version.version_no + 1}`}
          </button>
        </div>
      </header>

      {lowConfidenceCount > 0 && mode === "lines" && (
        <p className="border-l-2 border-risk bg-surface px-4 py-2 text-sm text-ink-2">
          <strong className="text-risk">{lowConfidenceCount}</strong>{" "}
          {lowConfidenceCount === 1 ? "palavra saiu" : "palavras saíram"} com baixa confiança.
          Elas aparecem sublinhadas — comece por elas.
        </p>
      )}

      {error && (
        <p role="alert" className="border-l-2 border-risk bg-surface px-4 py-2 text-sm text-risk">
          {error}
        </p>
      )}

      {mode === "paste" ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="pasted-lyrics" className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
            um verso por linha · linha em branco separa estrofes
          </label>
          <textarea
            id="pasted-lyrics"
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            rows={18}
            placeholder="Cole aqui a letra que você já tem."
            className="w-full resize-y border border-line bg-surface px-4 py-3 font-body text-[15px] leading-relaxed text-ink placeholder:text-ink-3 focus:border-amber focus:outline-none"
          />
          <p className="text-sm text-ink-2">
            O que coincidir com o áudio mantém o timing medido; o resto entra marcado para
            realinhamento.
          </p>
        </div>
      ) : (
        <ol className="flex flex-col border border-line">
          {version.lines.map((line, index) => {
            const editing = editingIndex === index;
            const edited = lines[index] !== line.text;
            return (
              <li
                key={line.id}
                className={`flex items-start gap-3 border-line-soft px-3 py-2 ${
                  index > 0 ? "border-t" : ""
                } ${line.starts_stanza && index > 0 ? "border-t-line" : ""} ${
                  index === activeIndex ? "bg-amber-soft" : "bg-surface"
                }`}
              >
                <button
                  type="button"
                  onClick={() => line.start_ms !== null && onSeek(line.start_ms)}
                  title="tocar a partir deste verso"
                  className={`shrink-0 pt-0.5 font-mono text-[11px] tabular-nums transition-colors hover:text-amber-bright ${
                    index === activeIndex ? "text-amber" : "text-ink-3"
                  }`}
                >
                  {formatTimecode(line.start_ms)}
                </button>

                {editing ? (
                  <input
                    autoFocus
                    value={lines[index] ?? ""}
                    onChange={(event) => {
                      const next = [...lines];
                      next[index] = event.target.value;
                      setLines(next);
                    }}
                    onBlur={() => setEditingIndex(null)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === "Escape") {
                        event.preventDefault();
                        setEditingIndex(null);
                      }
                    }}
                    aria-label={`verso ${index + 1}`}
                    className="min-w-0 flex-1 border-b border-amber bg-transparent font-body text-[15px] text-ink focus:outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingIndex(index)}
                    aria-label={`editar verso ${index + 1}`}
                    className="min-w-0 flex-1 text-left font-body text-[15px] text-ink hover:text-amber-bright"
                  >
                    {/* Enquanto o verso não foi tocado, mostramos as palavras marcadas
                        pela confiança do modelo. Verso importado (.lrc/Musixmatch) não
                        tem palavras — aí o texto da linha é o que existe. Depois de
                        editado, o texto é do usuário. */}
                    {edited || line.words.length === 0 ? lines[index] : (
                      <Words words={line.words} reviewed={isReviewed(index)} />
                    )}
                  </button>
                )}

                {/* Sem editar nada: você ouviu e o verso está certo. */}
                {!isReviewed(index) &&
                  !edited &&
                  line.words.some((word) => word.p < LOW_CONFIDENCE) && (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmed((previous) => new Set(previous).add(index))
                      }
                      title="está certo — tirar a marcação desta linha"
                      className="shrink-0 pt-0.5 font-mono text-[10px] text-ink-3 hover:text-ok"
                    >
                      confirmar
                    </button>
                  )}

                {(line.needs_realign || edited) && (
                  <span
                    title={edited ? "alterado, ainda não salvo" : "timing interpolado, não medido"}
                    className="shrink-0 pt-0.5 font-mono text-[10px] text-ink-3"
                  >
                    {edited ? "•" : "~"}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <p className="font-mono text-[11px] text-ink-3">
        ⌘S salva · clique no timecode para tocar o verso · salvar cria uma versão nova, a anterior
        continua acessível
      </p>
    </section>
  );
}
