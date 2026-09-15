/**
 * O que o shader precisa saber deste quadro — função PURA.
 *
 * Fica separado do desenho de propósito: assim dá para testar a tradução
 * `settings -> uniformes` sem GPU, sem DOM e sem Chromium, que é a mesma
 * regra do resto de `composition/`.
 */
import { EFEITOS_GL, FUNDOS_GERADOS, type Combinacao, type EfeitoGl, type FundoGerado } from "./fonte";
import type { VideoSettings } from "../settings";

export type Uniformes = {
  tamanho: readonly [number, number];
  ms: number;
  pulso: number;
  ambiente: number;
  intensidade: number;
  cor: readonly [number, number, number];
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const GERADOS = new Set<string>(FUNDOS_GERADOS);
const COM_GL = new Set<string>(EFEITOS_GL);

/** true quando a textura escolhida exige GPU (as demais são CSS). */
export function ehEfeitoGl(id: string): id is EfeitoGl {
  return COM_GL.has(id);
}

/** true quando o fundo da biblioteca é gerado por shader (e não uma foto). */
export function ehFundoGerado(id: string | null): id is FundoGerado {
  return id !== null && GERADOS.has(id);
}

/** `#rrggbb` para 0..1. Valor inválido cai em preto em vez de quebrar. */
export function corParaRgb(hex: string): readonly [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * A combinação de fundo e efeito deste settings.
 *
 * `temImagem` decide entre amostrar textura e usar cor sólida — e quando há
 * fundo gerado, ele manda: a imagem não é usada.
 */
export function combinacaoDe(settings: VideoSettings, temImagem: boolean): Combinacao {
  const { background, style } = settings;
  const gerado = background.kind === "library" && ehFundoGerado(background.ref);
  return {
    fundo: gerado ? (background.ref as FundoGerado) : null,
    efeito: ehEfeitoGl(style.texture) ? style.texture : null,
    temImagem: !gerado && temImagem,
  };
}

/** true quando esta configuração precisa de canvas. Fora disso, é DOM puro. */
export function precisaDeGl(settings: VideoSettings): boolean {
  const c = combinacaoDe(settings, false);
  return c.fundo !== null || c.efeito !== null;
}

export function uniformesDe(
  settings: VideoSettings,
  ms: number,
  pulso: number,
  tamanho: readonly [number, number],
): Uniformes {
  return {
    tamanho,
    ms,
    pulso: clamp(pulso, 0, 1),
    ambiente: clamp(settings.background.ambientIntensity, 0, 1),
    intensidade: clamp(settings.style.textureIntensity, 0, 1),
    cor: corParaRgb(settings.background.color),
  };
}
