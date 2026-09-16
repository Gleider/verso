import type { MovimentoId } from "./efeitos/movimento";
import { type Recorte, recorteValido } from "./tempo";

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

/**
 * As proporções que o projeto sabe desenhar.
 *
 * As três verticais existem porque é onde o vídeo é consumido: 9:16 é
 * TikTok/Reels/Shorts, 4:5 é o feed do Instagram (o formato mais alto que o
 * feed aceita sem cortar) e 1:1 é o quadrado que serve em qualquer lugar.
 * Cada uma tem tipografia AUTORAL em `formato.ts` — não derivada por regra de
 * três, que é o que faz letra de 16:9 chegar minúscula no retrato.
 */
export type AspectRatio = "16:9" | "9:16" | "4:5" | "1:1";
export type Resolucao = "720p" | "1080p";

/** Movimento contínuo da imagem de fundo. */
export type AmbientId = "breathe" | "pulse" | "drift" | "sway" | "zoom" | "none";

/**
 * As texturas, em duas famílias que o id não distingue de propósito (dado
 * gravado no banco não pode depender de como o efeito é desenhado):
 *
 * - **CSS** (`none`, `grain`, `sepia`, `dust`, `vignette`, `monocromatico`) —
 *   filtro ou camada por cima, composto pela GPU do navegador sem custo por
 *   quadro. Ver `efeitos/texturas-css.ts`.
 * - **Shader** (o resto) — precisam AMOSTRAR os pixels vizinhos, o que CSS
 *   não faz. Custam uma cadeia de canvas por quadro. Ver `efeitos/texturas.ts`.
 *
 * A escolha entre as duas é o que decide se o preview corre solto: com uma
 * textura CSS, `layers/Fundo.tsx` não monta canvas nenhum.
 */
export type TextureId =
  | "none"
  | "grain"
  | "vhs"
  | "paper"
  | "sepia"
  | "dust"
  | "halftone"
  | "vignette"
  | "bloom"
  | "cromatico"
  | "crt"
  | "zoomblur"
  | "pixelate"
  | "thermal"
  | "lightleak"
  | "emboss"
  | "contour"
  | "tvoff"
  | "monocromatico"
  | "glitch";

export type OverlayId = "none" | "scrim-bottom" | "scrim-full" | "vignette";

export type FontFamilyId =
  | "bricolage"
  | "source-serif"
  | "jetbrains"
  | "anton"
  | "archivo-black"
  | "bebas"
  | "playfair"
  | "space-grotesk"
  | "cascadia";

export type FontSize = "small" | "medium" | "large";
export type AlignH = "left" | "center" | "right";

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

/** Formas de visualizador de áudio. Todas desenhadas em DOM, sem canvas. */
export type VisualizerId = "none" | "barras" | "onda" | "circular" | "anel";

/** Sistemas de partícula. Um passe de shader, procedural. */
export type ParticulaId =
  | "none"
  | "poeira"
  | "neve"
  | "fagulhas"
  | "estrelas"
  | "vagalumes";

/** Onde uma camada fica em relação à letra. */
export type CamadaId = "atras" | "frente";

export type VideoSettings = {
  background: {
    kind: "upload" | "library" | "cover" | "color";
    /** Id do fundo procedural, quando `kind === "library"`. */
    ref: string | null;
    color: string;
    ambient: AmbientId;
    ambientIntensity: number;
    blur: number;
    darken: number;
    /** Gradação de cor, aplicada ao fundo. 1 = neutro para os três primeiros. */
    saturacao: number;
    contraste: number;
    brilho: number;
    /** Rotação de matiz em graus, -180 a 180. */
    matiz: number;
    /** Quanto a batida da música mexe na imagem, de 0 a 1. */
    reacaoBatida: number;
  };
  font: {
    family: FontFamilyId;
    size: FontSize;
    /** Multiplicador fino em cima do tamanho escolhido, 0.5 a 2. */
    escala: number;
    weight: number;
    alignH: AlignH;
    uppercase: boolean;
    lineHeight: number;
    /** Espaçamento entre letras, em px de design. */
    espacamento: number;
    /** Sombra projetada atrás do texto, 0 a 1. */
    sombra: number;
    /** Contorno do texto, 0 a 1. */
    contorno: number;
    /** Brilho difuso ao redor do texto, 0 a 1. */
    brilho: number;
  };
  motion: {
    animation: MotionId;
    tweak: TweakId;
    sync: SyncId;
    durationMs: number;
    /** Amplitude da animação escolhida, 0 a 1. */
    intensidade: number;
    /** Anima também a saída do verso, não só a entrada. */
    saida: boolean;
  };
  structure: {
    lyricsPosition: LyricsPosition;
    /** Quantos versos aparecem de cada lado do atual. 0 mostra só o atual. */
    vizinhos: number;
    /** Transparência dos vizinhos, de 0 (invisíveis) a 1 (iguais ao atual). */
    opacidadeVizinhos: number;
  };
  style: {
    palette: string;
    /**
     * Cores escolhidas à mão. `null` usa a paleta; qualquer valor aqui manda
     * nela — é o "seleção livre" ao lado das combinações prontas.
     */
    corCantada: string | null;
    corPorCantar: string | null;
    texture: TextureId;
    textureIntensity: number;
    /**
     * Movimento da intensidade do efeito ao longo do tempo.
     *
     * Intensidade fixa cansa: em dez segundos o olho para de ver o efeito. O
     * movimento devolve presença sem precisar de um efeito mais forte, que é
     * o caminho que acaba cobrindo a letra. Ver `efeitos/movimento.ts`.
     */
    movimento: MovimentoId;
    /** Quão rápido o movimento vai e volta. */
    movimentoVelocidade: number;
    /** Quanto da intensidade o movimento pode TIRAR. Em 1, o efeito some e volta. */
    movimentoProfundidade: number;
    overlay: OverlayId;
  };
  /**
   * Visualizador de áudio. Desenhado em DOM (divs com `transform`), não em
   * canvas: é a regra de CSS primeiro, e um punhado de barras custa nada.
   */
  visualizer: {
    tipo: VisualizerId;
    /** Atrás ou à frente da letra. */
    camada: CamadaId;
    posicao: LyricsPosition;
    /** Altura, como fração da altura do quadro. */
    tamanho: number;
    /** Largura, como fração da largura do quadro. */
    largura: number;
    opacidade: number;
    /** Quanto o áudio move o desenho, de 0 a 1. */
    intensidade: number;
    /** `null` usa a cor de texto cantado da paleta. */
    cor: string | null;
    /** Espelha o desenho no eixo horizontal. */
    espelhado: boolean;
  };
  /**
   * Partículas. SOMAM-SE à textura em vez de substituí-la: são uma camada
   * própria, com shader próprio, porque "granulado + neve" é uma combinação
   * que faz sentido e o catálogo de textura não permitiria.
   */
  particulas: {
    tipo: ParticulaId;
    camada: CamadaId;
    /** Densidade, de 0 a 1. */
    quantidade: number;
    tamanho: number;
    velocidade: number;
    opacidade: number;
    /** Quanto a batida acelera e acende as partículas. */
    reacaoBatida: number;
    /** `null` usa a cor natural do tipo escolhido. */
    cor: string | null;
  };
  output: {
    aspectRatio: AspectRatio;
    resolution: Resolucao;
    fps: number;
    /**
     * O trecho que vira vídeo. `null` = a música inteira.
     *
     * Existe para o corte de rede social: um refrão de vinte segundos, não os
     * três minutos e meio. O recorte não muda a composição — ver
     * `tempo.ts:janelaDeQuadros`.
     */
    recorte: Recorte | null;
  };
};

export type { MovimentoId };

export const SETTINGS_VERSION = 6;

export const SETTINGS_PADRAO: VideoSettings = {
  background: {
    kind: "color",
    ref: null,
    color: "#0c1316",
    ambient: "breathe",
    ambientIntensity: 0.55,
    blur: 0,
    darken: 0.35,
    saturacao: 1,
    contraste: 1,
    brilho: 1,
    matiz: 0,
    reacaoBatida: 0.5,
  },
  font: {
    family: "bricolage",
    size: "medium",
    escala: 1,
    weight: 800,
    alignH: "center",
    uppercase: false,
    lineHeight: 1.2,
    espacamento: 0,
    sombra: 0.4,
    contorno: 0,
    brilho: 0,
  },
  motion: {
    animation: "fill",
    tweak: "floating",
    sync: "line",
    durationMs: 600,
    intensidade: 0.6,
    saida: true,
  },
  structure: {
    lyricsPosition: "center",
    vizinhos: 0,
    opacidadeVizinhos: 0.35,
  },
  style: {
    palette: "estudio",
    corCantada: null,
    corPorCantar: null,
    texture: "none",
    textureIntensity: 0.5,
    // Parado por padrão: ligar movimento sozinho mudaria o visual de todo
    // projeto já salvo sem ninguém pedir.
    movimento: "none",
    movimentoVelocidade: 0.4,
    movimentoProfundidade: 0.6,
    overlay: "none",
  },
  visualizer: {
    tipo: "none",
    camada: "atras",
    posicao: "bottom",
    tamanho: 0.18,
    largura: 0.8,
    opacidade: 0.75,
    intensidade: 0.7,
    cor: null,
    espelhado: false,
  },
  particulas: {
    tipo: "none",
    camada: "frente",
    quantidade: 0.5,
    tamanho: 0.5,
    velocidade: 0.5,
    opacidade: 0.6,
    reacaoBatida: 0.4,
    cor: null,
  },
  output: {
    aspectRatio: "16:9",
    resolution: "1080p",
    fps: 30,
    recorte: null,
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

  // `mostrarVizinhos` (booleano) virou `vizinhos` (quantidade).
  //
  // A conversão que VALE é a do Pydantic (`StructureSettings`), porque ele
  // valida o JSONB e descarta campo desconhecido antes de o navegador ver o
  // projeto. Esta aqui cobre o caminho em que o settings chega cru — um
  // template antigo, um teste, um JSON colado à mão.
  const antigo = (b.structure ?? {}) as { mostrarVizinhos?: boolean };
  const structure = { ...SETTINGS_PADRAO.structure, ...b.structure };
  if (b.structure && b.structure.vizinhos === undefined && antigo.mostrarVizinhos !== undefined) {
    structure.vizinhos = antigo.mostrarVizinhos ? 1 : 0;
  }

  return {
    background: { ...SETTINGS_PADRAO.background, ...b.background },
    font: { ...SETTINGS_PADRAO.font, ...b.font },
    motion: { ...SETTINGS_PADRAO.motion, ...b.motion },
    structure,
    style: { ...SETTINGS_PADRAO.style, ...b.style },
    visualizer: { ...SETTINGS_PADRAO.visualizer, ...b.visualizer },
    particulas: { ...SETTINGS_PADRAO.particulas, ...b.particulas },
    // `recorte` é um ramo inteiro ou `null`, nunca meio preenchido: metade
    // dele vira NaN, e NaN não desenha nada (`pitfalls.md` §33).
    output: {
      ...SETTINGS_PADRAO.output,
      ...b.output,
      recorte: recorteValido(b.output?.recorte)
        ? { inicioMs: b.output.recorte.inicioMs, fimMs: b.output.recorte.fimMs }
        : null,
    },
  };
}
