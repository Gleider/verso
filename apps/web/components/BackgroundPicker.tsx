"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { DEFAULT_EFFECT, DEFAULT_INTENSITY, EFFECTS } from "@/lib/effects";

interface Props {
  trackId: string;
  initialHasBackground: boolean;
  initialEffect: string;
  initialIntensity: number;
}

/** Escolhe a imagem que aparece atrás da letra no player. */
export function BackgroundPicker({
  trackId,
  initialHasBackground,
  initialEffect,
  initialIntensity,
}: Props) {
  const [effect, setEffect] = useState(initialEffect || DEFAULT_EFFECT);
  const [intensity, setIntensity] = useState(initialIntensity ?? DEFAULT_INTENSITY);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Grava depois que a mão para de arrastar.
   *
   * Sem a espera, cada pixel do slider viraria uma requisição.
   */
  const persistEffect = useCallback(
    (nextEffect: string, nextIntensity: number) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        api
          .setEffect(trackId, nextEffect, nextIntensity)
          .catch(() => setError("Não foi possível salvar o efeito."));
      }, 400);
    },
    [trackId],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [hasBackground, setHasBackground] = useState(initialHasBackground);
  // Muda a cada troca para o navegador não servir a imagem antiga do cache.
  const [version, setVersion] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        await api.setBackground(trackId, file);
        setHasBackground(true);
        setVersion(Date.now());
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível enviar a imagem.");
      } finally {
        setBusy(false);
      }
    },
    [trackId],
  );

  async function clear() {
    setBusy(true);
    setError(null);
    try {
      await api.clearBackground(trackId);
      setHasBackground(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível remover a imagem.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Aceita tanto arquivo solto quanto imagem arrastada de outra aba.
   *
   * Arrastar da web entrega a imagem como item de string (uma URL), não como
   * arquivo — por isso a busca cobre os dois casos antes de desistir.
   */
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);

      const file = Array.from(event.dataTransfer.files).find((candidate) =>
        candidate.type.startsWith("image/"),
      );
      if (file) {
        void send(file);
        return;
      }

      if (event.dataTransfer.files.length > 0) {
        // Um arquivo veio, mas o sistema não o identificou como imagem.
        // O servidor valida pelo conteúdo, então vale tentar mesmo assim.
        void send(event.dataTransfer.files[0]);
        return;
      }

      setError("Solte um arquivo de imagem, ou clique para escolher um.");
    },
    [send],
  );

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        // Sair para um filho não conta como sair da área.
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={handleDrop}
      className={`flex flex-col gap-2 border border-dashed p-3 transition-colors ${
        dragging ? "border-amber bg-amber-soft" : "border-transparent"
      }`}
    >
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
        fundo do player
      </span>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="relative h-14 w-24 shrink-0 overflow-hidden border border-line bg-surface-2 transition-colors hover:border-amber disabled:opacity-50"
          aria-label={hasBackground ? "trocar imagem de fundo" : "escolher imagem de fundo"}
        >
          {hasBackground ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={api.backgroundUrl(trackId, version)}
              alt="Imagem de fundo atual desta faixa"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full items-center justify-center font-mono text-[10px] text-ink-3">
              escolher
            </span>
          )}
        </button>

        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm text-ink-2">
            {busy
              ? "Enviando…"
              : dragging
                ? "Solte para usar esta imagem."
                : hasBackground
                  ? "Imagem definida."
                  : "Arraste uma imagem aqui, ou clique no quadro."}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="font-mono text-[11px] text-ink-3 underline-offset-2 hover:text-amber hover:underline disabled:opacity-50"
            >
              {hasBackground ? "trocar" : "enviar imagem"}
            </button>
            {hasBackground && (
              <button
                type="button"
                onClick={() => void clear()}
                disabled={busy}
                className="font-mono text-[11px] text-ink-3 underline-offset-2 hover:text-risk hover:underline disabled:opacity-50"
              >
                remover
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 pt-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          efeito
        </span>
        <div className="flex flex-wrap gap-1.5">
          {EFFECTS.map((option) => (
            <button
              key={option.id}
              type="button"
              title={option.description}
              onClick={() => {
                setEffect(option.id);
                persistEffect(option.id, intensity);
              }}
              className={`border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                effect === option.id
                  ? "border-amber bg-amber text-ground"
                  : "border-line text-ink-2 hover:border-amber hover:text-amber"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="text-sm text-ink-2">
          {EFFECTS.find((option) => option.id === effect)?.description}
        </span>

        {effect !== "none" && (
          <label className="mt-1 flex items-center gap-3">
            <span className="font-mono text-[11px] text-ink-3">sutil</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(intensity * 100)}
              onChange={(event) => {
                const next = Number(event.target.value) / 100;
                setIntensity(next);
                persistEffect(effect, next);
              }}
              aria-label="intensidade do efeito"
              className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded bg-surface-2 accent-amber"
            />
            <span className="font-mono text-[11px] text-ink-3">forte</span>
            <span className="w-9 text-right font-mono text-[11px] tabular-nums text-amber">
              {Math.round(intensity * 100)}%
            </span>
          </label>
        )}
      </div>

      {error && (
        <p role="alert" className="border-l-2 border-risk bg-surface px-3 py-1.5 text-sm text-risk">
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        // `image/*` em vez de uma lista de extensões: o seletor do sistema
        // esconde arquivos válidos quando a lista não cobre o formato exato.
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void send(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
