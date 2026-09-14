"use client";

import { useRef, useState } from "react";
import { LyricsSourcePicker } from "@/components/LyricsSourcePicker";

const ACCEPTED = ".mp3,.wav,.flac,.m4a,.ogg,.opus";

export function UploadDropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const pick = (file: File | undefined) => {
    if (file) setPendingFile(file);
  };

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
          pick(event.dataTransfer.files?.[0]);
        }}
        className={`flex flex-col items-center justify-center gap-3 border border-dashed px-6 py-12 transition-colors ${
          dragging ? "border-amber bg-amber-soft" : "border-line bg-surface"
        }`}
      >
        <p className="font-display text-lg font-semibold">Solte uma música aqui</p>
        <p className="max-w-md text-center text-sm text-ink-2">
          Depois do envio você escolhe a origem da letra: transcrição com IA, um arquivo .lrc
          seu, ou a letra sincronizada do Musixmatch.
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-1 border border-amber bg-amber px-4 py-2 font-mono text-xs text-ground transition-colors hover:bg-amber-bright"
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
            pick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      {pendingFile && (
        <LyricsSourcePicker file={pendingFile} onClose={() => setPendingFile(null)} />
      )}
    </section>
  );
}
