/**
 * O que o editor de vídeo configura, e o que a composição lê.
 *
 * `type`, não `interface`: mesma razão de `props.ts` — precisa satisfazer
 * `Record<string, unknown>` no ponto de instanciação de `<Composition>` e de
 * `<Player>`.
 *
 * Nenhum campo cria versão nova de letra (`domain.md`): isto é aparência,
 * ajustada in-place.
 */

export type AspectRatio = "16:9" | "9:16";
export type Resolucao = "720p" | "1080p";
export type AmbientId = "breathe" | "pulse" | "drift" | "none";
export type TextureId =
  | "none"
  | "grain"
  | "vhs"
  | "paper"
  | "sepia"
  | "dust"
  | "halftone"
  | "vignette";
export type OverlayId = "none" | "scrim-bottom" | "scrim-full" | "vignette";

export type FontFamilyId = "bricolage" | "source-serif" | "jetbrains";
export type FontSize = "small" | "medium" | "large";
export type AlignH = "left" | "center" | "right" | "justify";
export type AlignV = "top" | "middle" | "bottom";

export type MotionId =
  | "fill"
  | "fade"
  | "slide"
  | "wipe"
  | "popup"
  | "scaling"
  | "mask"
  | "bubbling"
  | "static";
export type TweakId = "none" | "floating";
export type SyncId = "line" | "word" | "syllable";

export type LyricsPosition = "top" | "center" | "bottom";

export type VideoSettings = {
  background: {
    kind: "upload" | "library" | "cover" | "color";
    ref: string | null;
    color: string;
    ambient: AmbientId;
    ambientIntensity: number;
    blur: number;
    darken: number;
  };
  font: {
    family: FontFamilyId;
    size: FontSize;
    weight: number;
    alignH: AlignH;
    alignV: AlignV;
    uppercase: boolean;
    lineHeight: number;
  };
  motion: {
    animation: MotionId;
    tweak: TweakId;
    sync: SyncId;
    durationMs: number;
  };
  structure: {
    lyricsPosition: LyricsPosition;
  };
  style: {
    palette: string;
    texture: TextureId;
    textureIntensity: number;
    overlay: OverlayId;
  };
  output: {
    aspectRatio: AspectRatio;
    resolution: Resolucao;
    fps: number;
  };
};

export const SETTINGS_VERSION = 1;

export const SETTINGS_PADRAO: VideoSettings = {
  background: {
    kind: "color",
    ref: null,
    color: "#0c1316",
    ambient: "breathe",
    ambientIntensity: 0.55,
    blur: 0,
    darken: 0.35,
  },
  font: {
    family: "bricolage",
    size: "medium",
    weight: 800,
    alignH: "center",
    alignV: "middle",
    uppercase: false,
    lineHeight: 1.25,
  },
  motion: {
    animation: "fill",
    tweak: "none",
    sync: "syllable",
    durationMs: 420,
  },
  structure: {
    lyricsPosition: "center",
  },
  style: {
    palette: "estudio",
    texture: "none",
    textureIntensity: 0.5,
    overlay: "none",
  },
  output: {
    aspectRatio: "16:9",
    resolution: "1080p",
    fps: 30,
  },
};

/**
 * Traz um `settings` salvo (possivelmente de uma versão anterior do formato)
 * para a forma corrente, preenchendo o que faltar com o padrão.
 *
 * Sai mais barato que uma migration de banco a cada campo novo: o JSONB é o
 * armazenamento, este normalizador é o contrato.
 */
export function normalizarSettings(bruto: unknown): VideoSettings {
  const b = (bruto ?? {}) as Partial<VideoSettings>;
  return {
    background: { ...SETTINGS_PADRAO.background, ...b.background },
    font: { ...SETTINGS_PADRAO.font, ...b.font },
    motion: { ...SETTINGS_PADRAO.motion, ...b.motion },
    structure: { ...SETTINGS_PADRAO.structure, ...b.structure },
    style: { ...SETTINGS_PADRAO.style, ...b.style },
    output: { ...SETTINGS_PADRAO.output, ...b.output },
  };
}
