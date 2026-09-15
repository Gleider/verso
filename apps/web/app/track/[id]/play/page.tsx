import Link from "next/link";
import { notFound } from "next/navigation";
import { KaraokePlayerView } from "@/components/KaraokePlayerView";
import { normalizarSettings } from "@/composition/settings";
import type { TrackDetail, VideoProject } from "@/lib/types";
import { SERVER_API_URL } from "@/lib/server-api";
import { api } from "@/lib/api";

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

async function loadVideoProject(id: string): Promise<VideoProject | null> {
  try {
    const response = await fetch(`${SERVER_API_URL}/tracks/${id}/video-project`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export default async function PlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [track, project] = await Promise.all([loadTrack(id), loadVideoProject(id)]);
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
  const settings = normalizarSettings(project?.settings);
  // Só `upload` e `cover` têm arquivo: `library` é desenhada por CSS e `color`
  // é cor sólida — pedir a imagem nesses casos dava 404.
  const usaArquivo = settings.background.kind === "upload" || settings.background.kind === "cover";
  const backgroundUrl = usaArquivo ? api.backgroundUrl(track.id, 1) : null;

  return (
    <>
      <KaraokePlayerView
        track={track}
        lines={lines}
        lang={track.active_lyrics?.language ?? "pt"}
        settings={settings}
        backgroundUrl={backgroundUrl}
      />
      {semTiming > 0 && (
        <p className="sr-only">
          {semTiming} versos ainda não têm marcação de tempo e não serão destacados.
        </p>
      )}
    </>
  );
}
