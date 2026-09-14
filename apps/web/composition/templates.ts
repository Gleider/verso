/**
 * Os templates, como código tipado — não linhas no banco.
 *
 * São conteúdo de produto: mudam junto com o código, e assim entram no `tsc`
 * e nos testes. Miniaturas de verdade (`renderStill()` da própria composição)
 * ficam para quando o editor tiver uma rota de captura de quadro; por ora a
 * aba mostra um selo com a paleta e o nome, o suficiente para escolher.
 */
import { SETTINGS_PADRAO } from "./settings";
import type { VideoSettings } from "./settings";

export type Template = {
  id: string;
  rotulo: string;
  settings: VideoSettings;
};

function combinar(parcial: {
  background?: Partial<VideoSettings["background"]>;
  font?: Partial<VideoSettings["font"]>;
  motion?: Partial<VideoSettings["motion"]>;
  structure?: Partial<VideoSettings["structure"]>;
  style?: Partial<VideoSettings["style"]>;
}): VideoSettings {
  return {
    background: { ...SETTINGS_PADRAO.background, ...parcial.background },
    font: { ...SETTINGS_PADRAO.font, ...parcial.font },
    motion: { ...SETTINGS_PADRAO.motion, ...parcial.motion },
    structure: { ...SETTINGS_PADRAO.structure, ...parcial.structure },
    style: { ...SETTINGS_PADRAO.style, ...parcial.style },
    output: { ...SETTINGS_PADRAO.output },
  };
}

export const TEMPLATES: Template[] = [
  {
    id: "estudio",
    rotulo: "Estúdio",
    settings: combinar({}),
  },
  {
    id: "fita",
    rotulo: "Fita",
    settings: combinar({
      background: { ambient: "pulse", ambientIntensity: 0.6 },
      style: { palette: "fita", texture: "vhs", textureIntensity: 0.5 },
      font: { family: "jetbrains", uppercase: true },
    }),
  },
  {
    id: "papel",
    rotulo: "Papel",
    settings: combinar({
      background: { ambient: "none", darken: 0.15 },
      style: { palette: "papel", texture: "paper", textureIntensity: 0.5 },
      font: { family: "source-serif", weight: 700 },
    }),
  },
  {
    id: "meia-noite",
    rotulo: "Meia-noite",
    settings: combinar({
      background: { color: "#060a12", ambient: "drift", darken: 0.5 },
      style: { palette: "meia-noite", texture: "grain", textureIntensity: 0.25 },
      motion: { tweak: "floating" },
    }),
  },
  {
    id: "contraluz",
    rotulo: "Contraluz",
    settings: combinar({
      background: { darken: 0.55 },
      style: { overlay: "scrim-full", texture: "vignette", textureIntensity: 0.6 },
      motion: { animation: "fade" },
    }),
  },
  {
    id: "prensa",
    rotulo: "Prensa",
    settings: combinar({
      style: { texture: "halftone", textureIntensity: 0.45 },
      font: { family: "jetbrains", uppercase: true, weight: 700 },
      motion: { animation: "wipe" },
    }),
  },
  {
    id: "aurora",
    rotulo: "Aurora",
    settings: combinar({
      background: { ambient: "breathe", ambientIntensity: 0.7 },
      style: { palette: "neon-frio" },
      motion: { animation: "bubbling", sync: "syllable" },
    }),
  },
  {
    id: "neon-frio",
    rotulo: "Neon frio",
    settings: combinar({
      background: { color: "#050510", darken: 0.4 },
      style: { palette: "neon-frio", texture: "dust", textureIntensity: 0.35 },
      motion: { animation: "popup" },
    }),
  },
];

export function templatePorId(id: string): Template | null {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}
