/** Chamadas ao backend. Toda rota passa pelo rewrite /api do Next. */

import type {
  Job,
  LyricsVersion,
  Track,
  TrackDetail,
  TrackStats,
  VersionSummary,
} from "./types";

/**
 * O browser fala DIRETO com a API, sem passar pelo rewrite do Next.
 *
 * O proxy de `rewrites` derruba corpos acima de ~8 MB com 500, e um upload de
 * áudio vai a 50 MB. A API já libera CORS para http://localhost:3000.
 */
const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response
      .json()
      .then((body) => body?.detail)
      .catch(() => null);
    throw new Error(detail ?? `A requisição falhou (${response.status}).`);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const api = {
  listTracks: () => request<Track[]>("/tracks"),

  getTrack: (id: string) => request<TrackDetail>(`/tracks/${id}`),

  deleteTrack: (id: string) => request<void>(`/tracks/${id}`, { method: "DELETE" }),

  getStats: (id: string) => request<TrackStats>(`/tracks/${id}/stats`),

  getJob: (id: string) => request<Job>(`/jobs/${id}`),

  retranscribe: (id: string, model?: string) =>
    request<{ track_id: string; job_id: string }>(`/tracks/${id}/transcribe`, {
      method: "POST",
      body: JSON.stringify({ model: model ?? null }),
    }),

  /** Enfileira a montagem do MP4; responde na hora. */
  renderVideo: (id: string, resolution: "720p" | "1080p") =>
    request<Job>(`/tracks/${id}/render`, {
      method: "POST",
      body: JSON.stringify({ resolution }),
    }),

  listRenders: (id: string) => request<Job[]>(`/tracks/${id}/renders`),

  renderDownloadUrl: (trackId: string, jobId: string) =>
    `${BASE}/tracks/${trackId}/renders/${jobId}/file`,

  getLyrics: (id: string) => request<LyricsVersion>(`/tracks/${id}/lyrics`),

  saveLyrics: (id: string, lines: string[], reviewed: boolean[] = []) =>
    request<LyricsVersion>(`/tracks/${id}/lyrics`, {
      method: "PUT",
      body: JSON.stringify({
        lines: lines.map((text, idx) => ({
          idx,
          text,
          starts_stanza: false,
          reviewed: reviewed[idx] ?? false,
        })),
      }),
    }),

  /**
   * Grava os ajustes de tempo por verso feitos no player.
   * `nudge_ms` é somado ao timing medido: negativo faz o verso entrar antes.
   */
  saveNudges: (trackId: string, nudges: { line_id: string; nudge_ms: number }[]) =>
    request<LyricsVersion>(`/tracks/${trackId}/lyrics/nudges`, {
      method: "PATCH",
      body: JSON.stringify({ nudges }),
    }),

  /** Efeito aplicado à imagem de fundo. */
  setEffect: (id: string, background_effect: string, effect_intensity?: number) =>
    request<Track>(`/tracks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(
        effect_intensity === undefined
          ? { background_effect }
          : { background_effect, effect_intensity },
      ),
    }),

  /** Ajuste fino da letra: positivo adianta, negativo atrasa. */
  setOffset: (id: string, lyrics_offset_ms: number) =>
    request<Track>(`/tracks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ lyrics_offset_ms }),
    }),

  importLyrics: (id: string, text: string) =>
    request<LyricsVersion>(`/tracks/${id}/lyrics/import`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  listVersions: (id: string) => request<VersionSummary[]>(`/tracks/${id}/lyrics/versions`),

  activateVersion: (trackId: string, versionId: string) =>
    request<LyricsVersion>(`/tracks/${trackId}/lyrics/versions/${versionId}/activate`, {
      method: "POST",
    }),

  /** Upload não usa `request`: multipart não leva Content-Type manual. */
  async upload(file: File): Promise<{ track_id: string; job_id: string | null; duplicate: boolean }> {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`${BASE}/tracks`, { method: "POST", body: form });
    if (!response.ok) {
      const detail = await response
        .json()
        .then((body) => body?.detail)
        .catch(() => null);
      throw new Error(detail ?? "Não foi possível enviar o arquivo.");
    }
    return response.json();
  },

  /** PUT multipart: define a imagem de fundo do player. */
  async setBackground(id: string, file: File): Promise<TrackDetail> {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`${BASE}/tracks/${id}/background`, {
      method: "PUT",
      body: form,
    });
    if (!response.ok) {
      const detail = await response
        .json()
        .then((body) => body?.detail)
        .catch(() => null);
      throw new Error(detail ?? "Não foi possível enviar a imagem.");
    }
    return response.json();
  },

  clearBackground: (id: string) =>
    request<void>(`/tracks/${id}/background`, { method: "DELETE" }),

  /** `v` força o navegador a recarregar depois de uma troca de imagem. */
  backgroundUrl: (id: string, version = 0) =>
    `${BASE}/tracks/${id}/background${version ? `?v=${version}` : ""}`,

  audioUrl: (id: string, vocals = false) => `${BASE}/tracks/${id}/audio${vocals ? "?vocals=true" : ""}`,

  exportUrl: (id: string, format: "lrc" | "txt") =>
    `${BASE}/tracks/${id}/lyrics/export?format=${format}`,

  eventsUrl: (id: string) => `${BASE}/tracks/${id}/events`,
};

export function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "--:--";
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatTimecode(ms: number | null): string {
  if (ms === null || ms === undefined) return "--:--.--";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centis = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}
