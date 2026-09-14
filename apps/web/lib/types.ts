/**
 * Tipos que espelham os schemas do FastAPI.
 *
 * Enquanto o backend não estiver de pé, estes são escritos à mão. Assim que ele
 * subir, `npm run gen:api` gera `api-schema.d.ts` a partir do OpenAPI e o CI
 * passa a quebrar se os dois lados divergirem.
 */

import type { VideoSettings } from "@/composition/settings";

export type TrackState = "uploaded" | "processing" | "ready" | "failed";
export type JobState = "queued" | "running" | "done" | "failed";
export type LyricsSource = "asr" | "user_edit" | "imported" | "musixmatch";

export interface WordTiming {
  w: string;
  s: number;
  e: number;
  p: number;
}

export interface LyricLine {
  id: string;
  idx: number;
  text: string;
  start_ms: number | null;
  end_ms: number | null;
  words: WordTiming[];
  needs_realign: boolean;
  starts_stanza: boolean;
  reviewed: boolean;
  nudge_ms: number;
}

export interface LyricsVersion {
  id: string;
  track_id: string;
  version_no: number;
  source: LyricsSource;
  language: string | null;
  is_active: boolean;
  created_at: string;
  lines: LyricLine[];
}

export interface VersionSummary {
  id: string;
  version_no: number;
  source: LyricsSource;
  is_active: boolean;
  created_at: string;
  line_count: number;
}

export interface Job {
  id: string;
  track_id: string;
  state: JobState;
  stage: string | null;
  progress: number;
  error: string | null;
  /** Só em jobs de vídeo: onde o arquivo ficou. */
  output_key?: string | null;
  params?: Record<string, unknown>;
  finished_at: string | null;
}

export interface Track {
  id: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration_ms: number | null;
  state: TrackState;
  lyrics_offset_ms: number;
  created_at: string;
}

export interface TrackDetail extends Track {
  sha256: string;
  size_bytes: number;
  mime_type: string;
  has_vocals_stem: boolean;
  has_background: boolean;
  active_lyrics: LyricsVersion | null;
  latest_job: Job | null;
}

export interface TrackStats {
  lines: number;
  words: number;
  low_confidence: number;
}

// O tipo vem de `composition/settings.ts`, não é redefinido aqui: é o mesmo
// JSON que atravessa a API, o banco e o Chromium do render sem renomeação —
// duas cópias divergiriam em silêncio.
export type { VideoSettings };

export interface VideoProject {
  id: string;
  track_id: string;
  template_id: string | null;
  settings: VideoSettings;
  settings_version: number;
  updated_at: string;
}
