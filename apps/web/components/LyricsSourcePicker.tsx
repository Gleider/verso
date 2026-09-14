"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

/**
 * Escolha da origem da letra, logo após o upload (modo `file`) ou na página
 * de uma faixa que ainda não tem letra (modo `trackId`).
 *
 * O browser nunca fala com o Musixmatch: a busca sai da API, e um 404 volta
 * para cá para o usuário corrigir título/artista — ou cair de volta para IA.
 */

interface Props {
  /** Modo upload: o arquivo de áudio ainda não foi enviado. */
  file?: File;
  /** Modo faixa: a faixa já existe (envio tardio, falha anterior etc.). */
  trackId?: string;
  initialTitle?: string;
  initialArtist?: string | null;
  /** Modo upload: fechar o diálogo (cancelar). */
  onClose?: () => void;
  /** Modo faixa: a página precisa recarregar para mostrar a letra nova. */
  onDone?: () => void;
}

type Step = "escolha" | "lrc" | "musixmatch";

const BOTAO_PRIMARIO =
  "border border-amber bg-amber px-4 py-2 font-mono text-xs text-ground transition-colors hover:bg-amber-bright disabled:opacity-50";
const BOTAO_SECUNDARIO =
  "border border-line px-3 py-1.5 font-mono text-xs text-ink-2 transition-colors hover:border-amber hover:text-amber";

export function LyricsSourcePicker({
  file,
  trackId,
  initialTitle,
  initialArtist,
  onClose,
  onDone,
}: Props) {
  const router = useRouter();
  const lrcInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("escolha");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // No modo upload o título/artista só são conhecidos depois do POST /tracks.
  const [idDaFaixa, setIdDaFaixa] = useState<string | null>(trackId ?? null);
  const [titulo, setTitulo] = useState(initialTitle ?? "");
  const [artista, setArtista] = useState(initialArtist ?? "");

  const go = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível completar.");
    } finally {
      setBusy(false);
    }
  };

  const transcreverComIa = () =>
    go(async () => {
      if (file) {
        const result = await api.upload(file, { source: "asr" });
        router.push(`/track/${result.track_id}`);
      } else if (idDaFaixa) {
        await api.retranscribe(idDaFaixa);
        onDone?.();
      }
    });

  const abrirMusixmatch = () =>
    go(async () => {
      if (file) {
        const result = await api.upload(file, { source: "musixmatch" });
        const detalhe = await api.getTrack(result.track_id);
        setIdDaFaixa(result.track_id);
        setTitulo(detalhe.title);
        setArtista(detalhe.artist ?? "");
      }
      setStep("musixmatch");
    });

  const buscarMusixmatch = () =>
    go(async () => {
      if (!idDaFaixa) return;
      await api.fetchMusixmatch(idDaFaixa, titulo, artista);
      if (file) router.push(`/track/${idDaFaixa}`);
      else onDone?.();
    });

  const enviarLrc = (lrc: File) =>
    go(async () => {
      if (file) {
        const result = await api.upload(file, { source: "lrc", lrcFile: lrc });
        router.push(`/track/${result.track_id}`);
      } else if (idDaFaixa) {
        await api.importLrc(idDaFaixa, lrc);
        onDone?.();
      }
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ground/85 px-4">
      <div className="w-full max-w-md border border-line bg-surface p-6">
        <h2 className="font-display text-lg font-semibold">De onde vem a letra?</h2>

        {step === "escolha" && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-sm text-ink-2">
              O Verso separa a voz do instrumental e transcreve o canto — leva alguns minutos, mas
              não erra a letra de propósito. As outras opções são instantâneas.
            </p>
            <button type="button" onClick={() => void transcreverComIa()} disabled={busy} className={BOTAO_PRIMARIO}>
              {busy ? "enviando…" : "transcrever com IA"}
            </button>
            <button type="button" onClick={() => setStep("lrc")} disabled={busy} className={BOTAO_SECUNDARIO}>
              enviar um arquivo .lrc
            </button>
            <button type="button" onClick={() => void abrirMusixmatch()} disabled={busy} className={BOTAO_SECUNDARIO}>
              {busy ? "enviando…" : "baixar letra+sync do Musixmatch"}
            </button>
          </div>
        )}

        {step === "lrc" && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-sm text-ink-2">
              Escolha o arquivo .lrc com a letra sincronizada. O timing vem por verso; o
              preenchimento palavra a palavra fica para o realinhamento fino.
            </p>
            <input
              ref={lrcInputRef}
              type="file"
              accept=".lrc"
              className="hidden"
              onChange={(event) => {
                const lrc = event.target.files?.[0];
                if (lrc) void enviarLrc(lrc);
              }}
            />
            <button
              type="button"
              onClick={() => lrcInputRef.current?.click()}
              disabled={busy}
              className={BOTAO_PRIMARIO}
            >
              {busy ? "enviando…" : "escolher o .lrc"}
            </button>
            <button type="button" onClick={() => setStep("escolha")} disabled={busy} className={BOTAO_SECUNDARIO}>
              ← voltar
            </button>
          </div>
        )}

        {step === "musixmatch" && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-sm text-ink-2">
              Confira título e artista — é assim que o Musixmatch identifica a faixa.
            </p>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">título</span>
              <input
                value={titulo}
                onChange={(event) => setTitulo(event.target.value)}
                disabled={busy}
                className="border border-line bg-ground px-3 py-2 text-sm text-ink outline-none focus:border-amber"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">artista</span>
              <input
                value={artista}
                onChange={(event) => setArtista(event.target.value)}
                disabled={busy}
                className="border border-line bg-ground px-3 py-2 text-sm text-ink outline-none focus:border-amber"
              />
            </label>
            <button
              type="button"
              onClick={() => void buscarMusixmatch()}
              disabled={busy || !titulo.trim()}
              className={BOTAO_PRIMARIO}
            >
              {busy ? "buscando…" : "buscar letra+sync"}
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep("escolha")} disabled={busy} className={BOTAO_SECUNDARIO}>
                ← voltar
              </button>
              {file && (
                <button type="button" onClick={() => void transcreverComIa()} disabled={busy} className={BOTAO_SECUNDARIO}>
                  desistir e transcrever com IA
                </button>
              )}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 border-l-2 border-risk px-4 py-2 text-sm text-risk">
            {error}
          </p>
        )}
        {step === "escolha" && onClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="mt-4 font-mono text-[11px] text-ink-3 hover:text-amber"
          >
            cancelar
          </button>
        )}
      </div>
    </div>
  );
}
