/** Chamadas ao backend. O browser fala direto com a API — ver nota abaixo. */

import type { VersoRascunho } from "./rascunho";
import type {
  Job,
  LyricsVersion,
  Track,
  TrackDetail,
  TrackStats,
  VersionSummary,
  VideoProject,
  VideoSettings,
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

  /**
   * Salva a letra como uma versão nova.
   *
   * `start_ms` só viaja para o verso que teve o tempo escrito à mão (ponto de
   * legenda novo): para todos os outros o servidor reaproveita o timing medido,
   * que é o dado que o editor nem recebe de volta palavra a palavra.
   */
  saveLyrics: (id: string, versos: VersoRascunho[]) =>
    request<LyricsVersion>(`/tracks/${id}/lyrics`, {
      method: "PUT",
      body: JSON.stringify({
        lines: versos.map((verso, idx) => ({
          idx,
          text: verso.texto,
          starts_stanza: verso.abreEstrofe,
          reviewed: verso.revisado,
          start_ms: verso.fixado ? verso.medidoMs : null,
          nudge_ms: verso.nudgeMs,
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

  /** Renomeia o projeto. O nome nasce do metadado do mp3, mas é do usuário. */
  updateTrack: (id: string, dados: { title?: string; artist?: string | null }) =>
    request<Track>(`/tracks/${id}`, { method: "PATCH", body: JSON.stringify(dados) }),

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

  /** Apaga uma versão. A resposta traz a versão que passou a valer no lugar. */
  discardVersion: (trackId: string, versionId: string) =>
    request<LyricsVersion>(`/tracks/${trackId}/lyrics/versions/${versionId}`, {
      method: "DELETE",
    }),

  /** Upload não usa `request`: multipart não leva Content-Type manual. */
  async upload(
    file: File,
    opts?: { source?: string; lrcFile?: File },
  ): Promise<{ track_id: string; job_id: string | null; duplicate: boolean }> {
    const form = new FormData();
    form.append("file", file);
    form.append("source", opts?.source ?? "asr");
    if (opts?.lrcFile) form.append("lrc_file", opts.lrcFile);
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

  /** Envia um .lrc para uma faixa que já existe (página da faixa). */
  async importLrc(id: string, file: File): Promise<LyricsVersion> {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`${BASE}/tracks/${id}/lyrics/import-lrc`, {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      const detail = await response
        .json()
        .then((body) => body?.detail)
        .catch(() => null);
      throw new Error(detail ?? "Não foi possível importar o .lrc.");
    }
    return response.json();
  },

  /** Busca letra+sync no Musixmatch (a chamada sai da API, nunca do browser). */
  fetchMusixmatch: (id: string, title: string, artist: string) =>
    request<LyricsVersion>(`/tracks/${id}/lyrics/musixmatch`, {
      method: "POST",
      body: JSON.stringify({ title, artist }),
    }),

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

  /** Devolve o projeto do editor de vídeo, criando-o com os padrões se não houver. */
  getVideoProject: (id: string) => request<VideoProject>(`/tracks/${id}/video-project`),

  /**
   * Grava `settings` inteiro — nunca cria versão de letra, é aparência.
   *
   * `keepalive` existe para o salvamento de última hora, quando a aba está
   * fechando ou recarregando: sem ele o navegador cancela a requisição junto
   * com a página e o ajuste some sem aviso. Tem limite de 64 KB de corpo, o
   * que sobra para um `VideoSettings`.
   */
  updateVideoProject: (
    id: string,
    settings: VideoSettings,
    templateId: string | null = null,
    keepalive = false,
  ) =>
    request<VideoProject>(`/tracks/${id}/video-project`, {
      method: "PUT",
      body: JSON.stringify({ template_id: templateId, settings }),
      keepalive,
    }),

  listVideoTemplates: () => request<unknown[]>("/video/templates"),
};

export function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "--:--";
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
