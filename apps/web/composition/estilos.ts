/**
 * Combinações de estilo: um clique que acerta paleta, textura, véu, gradação
 * de cor e os efeitos do texto de uma vez.
 *
 * É o que a spec §7 pede da aba Style — "defaults de combinação de
 * sobreefeito, cor de fonte e overlay de fundo". Diferente de um template,
 * uma combinação **não** mexe em movimento, estrutura nem formato: ela é só a
 * superfície, para poder ser trocada sem desfazer o resto do trabalho.
 *
 * Só dados. Quem aplica é `aplicarCombinacao`, que devolve settings novo.
 */
import type { VideoSettings } from "./settings";

export type CombinacaoDeEstilo = {
  id: string;
  rotulo: string;
  descricao: string;
  /** Cor de amostra para o cartão da combinação no painel. */
  amostra: string;
  /**
   * Sem as cores manuais: escolher uma combinação é escolher a paleta dela, e
   * `aplicarCombinacao` limpa a seleção livre. Manter a cor antiga por cima
   * faria a combinação sair diferente do cartão que o usuário clicou.
   */
  // O movimento da intensidade fica de fora de propósito: preset escolhe
  // aparência (paleta, textura, véu), não o ritmo com que ela respira — isso é
  // ajuste de quem monta, e herda o padrão.
  style: Omit<
    VideoSettings["style"],
    "corCantada" | "corPorCantar" | "movimento" | "movimentoVelocidade" | "movimentoProfundidade"
  >;
  /** Gradação de cor do fundo — o que dá caráter à imagem. */
  cor: Pick<VideoSettings["background"], "saturacao" | "contraste" | "brilho" | "matiz" | "darken">;
  /** Os efeitos do texto que fazem parte do visual. */
  texto: Pick<VideoSettings["font"], "sombra" | "contorno" | "brilho">;
};

export const COMBINACOES: CombinacaoDeEstilo[] = [
  {
    id: "estudio",
    rotulo: "Estúdio",
    descricao: "A identidade do Verso: âmbar sobre grafite, sem enfeite.",
    amostra: "rgb(232, 163, 61)",
    style: { palette: "estudio", texture: "none", textureIntensity: 0.5, overlay: "scrim-full" },
    cor: { saturacao: 1, contraste: 1.05, brilho: 0.95, matiz: 0, darken: 0.4 },
    texto: { sombra: 0.5, contorno: 0, brilho: 0 },
  },
  {
    id: "fita",
    rotulo: "Fita",
    descricao: "VHS: varredura, sangria de cor e a imagem batendo na música.",
    amostra: "rgb(245, 185, 89)",
    style: { palette: "fita", texture: "vhs", textureIntensity: 0.8, overlay: "vignette" },
    cor: { saturacao: 1.35, contraste: 1.15, brilho: 1.02, matiz: -6, darken: 0.28 },
    texto: { sombra: 0.7, contorno: 0.2, brilho: 0.15 },
  },
  {
    id: "super8",
    rotulo: "Super 8",
    descricao: "Sépia, poeira e vinheta — o filme velho que chiou na gaveta.",
    amostra: "rgb(214, 158, 96)",
    style: { palette: "papel", texture: "sepia", textureIntensity: 0.85, overlay: "vignette" },
    cor: { saturacao: 0.55, contraste: 1.2, brilho: 1.05, matiz: 12, darken: 0.22 },
    texto: { sombra: 0.65, contorno: 0.1, brilho: 0 },
  },
  {
    id: "neon",
    rotulo: "Neon",
    descricao: "Cor estourada, halo forte no texto e aberração cromática.",
    amostra: "rgb(94, 234, 212)",
    style: { palette: "neon-frio", texture: "cromatico", textureIntensity: 0.75, overlay: "scrim-full" },
    cor: { saturacao: 1.6, contraste: 1.25, brilho: 0.92, matiz: -18, darken: 0.45 },
    texto: { sombra: 0.4, contorno: 0, brilho: 0.85 },
  },
  {
    id: "sonho",
    rotulo: "Sonho",
    descricao: "Estouro de luz suave, cor lavada e texto brilhando de leve.",
    amostra: "rgb(196, 181, 253)",
    style: { palette: "meia-noite", texture: "bloom", textureIntensity: 0.7, overlay: "scrim-bottom" },
    cor: { saturacao: 0.85, contraste: 0.92, brilho: 1.12, matiz: 8, darken: 0.18 },
    texto: { sombra: 0.35, contorno: 0, brilho: 0.5 },
  },
  {
    id: "impresso",
    rotulo: "Impresso",
    descricao: "Retícula de jornal e papel: alto contraste, cor quase ausente.",
    amostra: "rgb(180, 96, 52)",
    style: { palette: "papel", texture: "halftone", textureIntensity: 0.9, overlay: "none" },
    cor: { saturacao: 0.25, contraste: 1.5, brilho: 1.15, matiz: 0, darken: 0.1 },
    texto: { sombra: 0, contorno: 0.55, brilho: 0 },
  },
  {
    id: "noturno",
    rotulo: "Noturno",
    descricao: "Fundo apagado e frio, letra branca com sombra dura.",
    amostra: "rgb(126, 178, 232)",
    style: { palette: "meia-noite", texture: "vignette", textureIntensity: 0.8, overlay: "scrim-full" },
    cor: { saturacao: 0.7, contraste: 1.1, brilho: 0.75, matiz: -12, darken: 0.55 },
    texto: { sombra: 0.85, contorno: 0, brilho: 0 },
  },
  {
    id: "tubo",
    rotulo: "Tubo",
    descricao: "Tela curva de TV antiga: lente, varredura e cantos escuros.",
    amostra: "rgb(126, 232, 186)",
    style: { palette: "neon-frio", texture: "crt", textureIntensity: 0.8, overlay: "none" },
    cor: { saturacao: 1.2, contraste: 1.3, brilho: 1.05, matiz: -4, darken: 0.2 },
    texto: { sombra: 0.5, contorno: 0.15, brilho: 0.3 },
  },
  {
    id: "explosao",
    rotulo: "Explosão",
    descricao: "Borrão radial que salta na batida — o efeito mais reativo.",
    amostra: "rgb(245, 120, 89)",
    style: { palette: "fita", texture: "zoomblur", textureIntensity: 0.65, overlay: "scrim-full" },
    cor: { saturacao: 1.4, contraste: 1.2, brilho: 1, matiz: 0, darken: 0.3 },
    texto: { sombra: 0.6, contorno: 0, brilho: 0.4 },
  },
  {
    id: "granulado",
    rotulo: "Granulado",
    descricao: "Grão de filme por cima de tudo, cor crua, contorno no texto.",
    amostra: "rgb(230, 238, 239)",
    style: { palette: "estudio", texture: "grain", textureIntensity: 0.95, overlay: "scrim-bottom" },
    cor: { saturacao: 0.9, contraste: 1.3, brilho: 0.98, matiz: 0, darken: 0.32 },
    texto: { sombra: 0.3, contorno: 0.35, brilho: 0 },
  },
];

export function combinacaoPorId(id: string): CombinacaoDeEstilo | null {
  return COMBINACOES.find((c) => c.id === id) ?? null;
}

/**
 * Aplica a combinação sem tocar em movimento, estrutura, formato nem na
 * origem do fundo — trocar de visual não pode desfazer a imagem escolhida.
 */
export function aplicarCombinacao(
  settings: VideoSettings,
  combinacao: CombinacaoDeEstilo,
): VideoSettings {
  return {
    ...settings,
    background: { ...settings.background, ...combinacao.cor },
    font: { ...settings.font, ...combinacao.texto },
    // Parte de `settings.style`, e nao de um objeto novo: o preset escolhe
    // aparencia e o movimento da intensidade e ajuste de quem monta — aplicar
    // uma combinacao nao pode apagar o que a pessoa ja tinha regulado.
    style: { ...settings.style, ...combinacao.style, corCantada: null, corPorCantar: null },
  };
}
