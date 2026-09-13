import Link from "next/link";
import { notFound } from "next/navigation";
import { KaraokePlayer } from "@/components/KaraokePlayer";
import type { TrackDetail } from "@/lib/types";
import { SERVER_API_URL } from "@/lib/server-api";

export const dynamic = "force-dynamic";

async function loadTrack(id: string): Promise<TrackDetail | null> {
  try {
    const response = await fetch(`${SERVER_API_URL}/tracks/${id}`, { cache: "no-store" });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export default async function PlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const track = await loadTrack(id);
  if (!track) notFound();

  const lines = track.active_lyrics?.lines ?? [];

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 border border-line bg-surface px-6 py-16 text-center">
        <p className="font-display text-lg font-semibold">Esta faixa ainda não tem letra</p>
        <p className="max-w-md text-sm text-ink-2">
          O player acompanha a letra junto com o áudio. Assim que a transcrição terminar, ele fica
          disponível.
        </p>
        <Link
          href={`/track/${id}`}
          className="border border-line px-3 py-1.5 font-mono text-xs text-ink-2 hover:border-amber hover:text-amber"
        >
          voltar para a faixa
        </Link>
      </div>
    );
  }

  const semTiming = lines.filter((line) => line.start_ms === null).length;

  return (
    <>
      <KaraokePlayer
        track={track}
        lines={lines}
        lang={track.active_lyrics?.language ?? "pt"}
      />
      {semTiming > 0 && (
        <p className="sr-only">
          {semTiming} versos ainda não têm marcação de tempo e não serão destacados.
        </p>
      )}
    </>
  );
}
