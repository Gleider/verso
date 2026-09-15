/**
 * Os templates, como código tipado — não linhas no banco.
 *
 * São conteúdo de produto: mudam junto com o código, e assim entram no `tsc`
 * e nos testes. Miniaturas de verdade (`renderStill()` da própria composição)
 * ficam para quando o editor tiver uma rota de captura de quadro; por ora a
 * aba mostra o fundo real do template e o nome, o suficiente para escolher.
 *
 * Um template é um ponto de partida COMPLETO: fundo, fonte, movimento,
 * estrutura e estilo. É a diferença para uma combinação de estilo
 * (`estilos.ts`), que só troca a superfície. Cada um aqui parte de um fundo da
 * biblioteca para que o visual exista mesmo antes de o usuário enviar imagem —
 * antes disso, todos os templates caíam na mesma tela escura e pareciam
 * idênticos.
 */
import { SETTINGS_PADRAO } from "./settings";
import type { VideoSettings } from "./settings";

export type Template = {
  id: string;
  rotulo: string;
  descricao: string;
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
    descricao: "A identidade do Verso. Sílaba a sílaba, sem textura.",
    settings: combinar({
      background: {
        kind: "library",
        ref: "grade",
        ambient: "breathe",
        ambientIntensity: 0.5,
        darken: 0.35,
        contraste: 1.05,
      },
      font: { family: "bricolage", size: "medium", weight: 800, sombra: 0.5 },
      motion: { animation: "fill", sync: "syllable", tweak: "floating", intensidade: 0.5 },
      style: { palette: "estudio", texture: "none", textureIntensity: 0.5, overlay: "scrim-full" },
    }),
  },
  {
    id: "fita",
    rotulo: "Fita",
    descricao: "VHS de verdade: varredura, sangria de cor e imagem pulsando.",
    settings: combinar({
      background: {
        kind: "library",
        ref: "vinil",
        ambient: "pulse",
        ambientIntensity: 0.8,
        reacaoBatida: 0.9,
        saturacao: 1.35,
        contraste: 1.15,
        matiz: -6,
        darken: 0.25,
      },
      font: {
        family: "jetbrains",
        size: "medium",
        weight: 700,
        uppercase: true,
        espacamento: 4,
        sombra: 0.7,
        contorno: 0.2,
      },
      motion: { animation: "slide", sync: "word", tweak: "none", intensidade: 0.8, durationMs: 420 },
      style: { palette: "fita", texture: "vhs", textureIntensity: 0.85, overlay: "vignette" },
    }),
  },
  {
    id: "impresso",
    rotulo: "Impresso",
    descricao: "Retícula de jornal, serifa pesada e contorno grosso.",
    settings: combinar({
      background: {
        kind: "library",
        ref: "papel",
        ambient: "none",
        darken: 0.05,
        saturacao: 0.25,
        contraste: 1.5,
        brilho: 1.12,
      },
      font: {
        family: "playfair",
        size: "large",
        weight: 900,
        lineHeight: 1.05,
        sombra: 0,
        contorno: 0.5,
      },
      motion: { animation: "wipe", sync: "line", tweak: "none", intensidade: 0.7, saida: true },
      structure: { lyricsPosition: "bottom", vizinhos: 0 },
      style: { palette: "papel", texture: "halftone", textureIntensity: 0.9, overlay: "none" },
    }),
  },
  {
    id: "neon",
    rotulo: "Neon",
    descricao: "Cor estourada, halo forte no texto, letra saltando por sílaba.",
    settings: combinar({
      background: {
        kind: "library",
        ref: "neon",
        ambient: "zoom",
        ambientIntensity: 0.75,
        reacaoBatida: 0.8,
        saturacao: 1.6,
        contraste: 1.25,
        matiz: -18,
        darken: 0.35,
      },
      font: {
        family: "archivo-black",
        size: "large",
        uppercase: true,
        espacamento: 2,
        sombra: 0.3,
        brilho: 0.9,
      },
      motion: { animation: "popup", sync: "syllable", tweak: "floating", intensidade: 0.9 },
      style: { palette: "neon-frio", texture: "cromatico", textureIntensity: 0.75, overlay: "scrim-full" },
    }),
  },
  {
    id: "super8",
    rotulo: "Super 8",
    descricao: "Sépia, poeira e vinheta — filme velho, letra pequena no rodapé.",
    settings: combinar({
      background: {
        kind: "library",
        ref: "brasa",
        ambient: "sway",
        ambientIntensity: 0.6,
        saturacao: 0.5,
        contraste: 1.2,
        brilho: 1.06,
        matiz: 14,
        darken: 0.2,
      },
      font: { family: "source-serif", size: "small", weight: 600, sombra: 0.65, contorno: 0.1 },
      motion: { animation: "fade", sync: "line", tweak: "floating", intensidade: 0.45, durationMs: 900 },
      structure: { lyricsPosition: "bottom", vizinhos: 1 },
      style: { palette: "papel", texture: "sepia", textureIntensity: 0.85, overlay: "vignette" },
    }),
  },
  {
    id: "cartaz",
    rotulo: "Cartaz",
    descricao: "Tipo condensado gigante no topo, sem imagem competindo.",
    settings: combinar({
      background: {
        kind: "library",
        ref: "raios",
        ambient: "drift",
        ambientIntensity: 0.85,
        reacaoBatida: 0.7,
        contraste: 1.2,
        darken: 0.4,
      },
      font: {
        family: "bebas",
        size: "large",
        escala: 1.3,
        uppercase: true,
        lineHeight: 0.95,
        espacamento: 6,
        sombra: 0.55,
      },
      motion: { animation: "scaling", sync: "line", tweak: "none", intensidade: 0.85 },
      structure: { lyricsPosition: "top", vizinhos: 0 },
      style: { palette: "estudio", texture: "grain", textureIntensity: 0.6, overlay: "scrim-full" },
    }),
  },
  {
    id: "sonho",
    rotulo: "Sonho",
    descricao: "Estouro de luz, cor lavada, palavras borbulhando.",
    settings: combinar({
      background: {
        kind: "library",
        ref: "aurora",
        ambient: "breathe",
        ambientIntensity: 0.9,
        saturacao: 0.85,
        contraste: 0.95,
        brilho: 1.12,
        matiz: 8,
        darken: 0.15,
      },
      font: { family: "space-grotesk", size: "medium", weight: 500, sombra: 0.35, brilho: 0.55 },
      motion: { animation: "bubbling", sync: "word", tweak: "floating", intensidade: 0.7 },
      style: { palette: "meia-noite", texture: "bloom", textureIntensity: 0.7, overlay: "scrim-bottom" },
    }),
  },
  {
    id: "recorte",
    rotulo: "Recorte",
    descricao: "A letra é janela: o fundo aparece dentro do próprio texto.",
    settings: combinar({
      background: {
        kind: "library",
        ref: "oceano",
        ambient: "zoom",
        ambientIntensity: 0.7,
        saturacao: 1.3,
        contraste: 1.3,
        darken: 0.5,
      },
      font: {
        family: "anton",
        size: "large",
        escala: 1.15,
        uppercase: true,
        lineHeight: 1,
        sombra: 0,
      },
      motion: { animation: "mask", sync: "line", tweak: "none", intensidade: 0.75 },
      style: { palette: "neon-frio", texture: "vignette", textureIntensity: 0.7, overlay: "none" },
    }),
  },
];

export function templatePorId(id: string): Template | null {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}
