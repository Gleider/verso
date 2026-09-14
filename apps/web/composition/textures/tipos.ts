/**
 * O contrato de uma textura: o que dá superfície à imagem de fundo.
 *
 * Espelha `EffectFrame` de `lib/effects.ts`, mas para a camada que fica POR
 * CIMA do fundo (grão, varredura, retícula), não para o movimento do fundo
 * em si — isso é `layers/Fundo.tsx`. Uma função pura `(ms, intensidade) =>
 * estado`, testável sem DOM; `layers/Textura.tsx` é o único `.tsx` que
 * escreve o resultado em `style`.
 */
export type EstadoDeTextura = {
  /** Filtro CSS aplicado à camada de baixo. "none" quando não altera cor. */
  filter: string;
  /** Opacidade de cada sobreposição, de 0 a 1. 0 desliga a camada. */
  granulado: number;
  varredura: number;
  reticula: number;
  vinheta: number;
  /** Deslocamento da textura, em px. É o que faz o ruído "chiar". */
  deslocamento: { x: number; y: number };
  /** Cópia deslocada da imagem, para separar as cores. null quando não usa. */
  croma: { transform: string; opacity: number } | null;
  /** Faixa horizontal deslocada (falha de rastreamento). null na maioria. */
  faixa: { y: number; height: number; shift: number } | null;
};

/** `pulso` (0..1) é usado só por texturas que reagem à batida, como `vhs`. */
export type Textura = (ms: number, intensidade: number, pulso: number) => EstadoDeTextura;

/** Estado sem nenhum efeito — o ponto de partida de toda textura. */
export const ESTADO_NEUTRO: EstadoDeTextura = {
  filter: "none",
  granulado: 0,
  varredura: 0,
  reticula: 0,
  vinheta: 0,
  deslocamento: { x: 0, y: 0 },
  croma: null,
  faixa: null,
};
