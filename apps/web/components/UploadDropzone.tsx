"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

const ACCEPTED = ".mp3,.wav,.flac,.m4a,.ogg,.opus";

export function UploadDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (file: File) => {
      setSending(true);
      setError(null);
      try {
        const result = await api.upload(file);
        router.push(`/track/${result.track_id}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível enviar o arquivo.");
      } finally {
        setSending(false);
      }
    },
    [router],
  );

  return (
    <section>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void send(file);
        }}
        className={`flex flex-col items-center justify-center gap-3 border border-dashed px-6 py-12 transition-colors ${
          dragging ? "border-amber bg-amber-soft" : "border-line bg-surface"
        }`}
      >
        <p className="font-display text-lg font-semibold">
          {sending ? "Enviando…" : "Solte uma música aqui"}
        </p>
        <p className="max-w-md text-center text-sm text-ink-2">
          O Verso separa a voz do instrumental e transcreve o que está sendo cantado. Leva alguns
          minutos por faixa.
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={sending}
          className="mt-1 border border-amber bg-amber px-4 py-2 font-mono text-xs text-ground transition-colors hover:bg-amber-bright disabled:opacity-50"
        >
          escolher arquivo
        </button>
        <p className="font-mono text-[11px] text-ink-3">mp3 · wav · flac · m4a · até 50 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void send(file);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 border-l-2 border-risk bg-surface px-4 py-2 text-sm text-risk">
          {error}
        </p>
      )}
    </section>
  );
}
