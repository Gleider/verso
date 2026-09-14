import { notFound } from "next/navigation";
import { VideoEditor } from "@/components/video-editor/VideoEditor";
import type { TrackDetail, VideoProject } from "@/lib/types";
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

export default async function TrackVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [track, project] = await Promise.all([loadTrack(id), loadVideoProject(id)]);
  if (!track || !project) notFound();

  if (track.state !== "ready" || !track.active_lyrics) {
    return (
      <div className="flex flex-col gap-3 border border-line-soft bg-surface px-5 py-6">
        <h1 className="font-display text-xl text-ink">O editor de vídeo ainda não está pronto</h1>
        <p className="text-sm text-ink-2">
          Esta faixa precisa de uma transcrição pronta antes de o editor de vídeo abrir.
        </p>
      </div>
    );
  }

  return <VideoEditor track={track} initialProject={project} />;
}
