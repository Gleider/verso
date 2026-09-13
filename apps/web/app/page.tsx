import Link from "next/link";
import { UploadDropzone } from "@/components/UploadDropzone";
import { api, formatDuration } from "@/lib/api";
import type { Track } from "@/lib/types";
import { SERVER_API_URL } from "@/lib/server-api";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<Track["state"], string> = {
  uploaded: "na fila",
  processing: "processando",
  ready: "pronta",
  failed: "falhou",
};

const STATE_COLOR: Record<Track["state"], string> = {
  uploaded: "text-ink-3",
  processing: "text-amber",
  ready: "text-ok",
  failed: "text-risk",
};

async function loadTracks(): Promise<Track[]> {
  try {
    const response = await fetch(`${SERVER_API_URL}/tracks`, { cache: "no-store" });
    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
}

export default async function LibraryPage() {
  const tracks = await loadTracks();

  return (
    <div className="flex flex-col gap-10">
      <UploadDropzone />

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-semibold tracking-tight">Biblioteca</h2>
          <span className="font-mono text-xs text-ink-3">
            {tracks.length} {tracks.length === 1 ? "faixa" : "faixas"}
          </span>
        </div>

        {tracks.length === 0 ? (
          <p className="border border-line bg-surface px-5 py-8 text-center text-sm text-ink-2">
            Nenhuma faixa ainda. Envie a primeira acima.
          </p>
        ) : (
          <ul className="border border-line">
            {tracks.map((track, index) => (
              <li key={track.id} className={index > 0 ? "border-t border-line-soft" : ""}>
                <Link
                  href={`/track/${track.id}`}
                  className="flex items-center gap-4 bg-surface px-5 py-3.5 transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[15px] font-semibold">
                      {track.title}
                    </span>
                    <span className="block truncate text-sm text-ink-2">
                      {track.artist ?? "artista desconhecido"}
                    </span>
                  </span>
                  <span className="font-mono text-xs tabular-nums text-ink-3">
                    {formatDuration(track.duration_ms)}
                  </span>
                  <span
                    className={`w-28 text-right font-mono text-[11px] uppercase tracking-wider ${STATE_COLOR[track.state]}`}
                  >
                    {STATE_LABEL[track.state]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
