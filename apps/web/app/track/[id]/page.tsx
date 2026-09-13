import { notFound } from "next/navigation";
import { TrackWorkspace } from "@/components/TrackWorkspace";
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

export default async function TrackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const track = await loadTrack(id);
  if (!track) notFound();
  return <TrackWorkspace track={track} />;
}
