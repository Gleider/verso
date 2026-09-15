/**
 * Catálogo de fontes da composição e o carregamento delas.
 *
 * As fontes do sistema do usuário não existem dentro do Chromium do render —
 * `find_font()` do `verso_video/frames.py` (o código que este projeto
 * substitui) já caía num fallback pobre pelo mesmo motivo. A composição
 * embute as próprias fontes em WOFF2, sob `public/fonts/`, e usa `loadFont()`
 * de `@remotion/fonts`, que já embute `delayRender`/`continueRender` — o
 * render espera a fonte carregar antes do quadro 0, e falha alto se não
 * carregar, em vez de sair calado com a fonte errada.
 *
 * As oito famílias da spec, todas SIL OFL. As seis primeiras variam o peso
 * num eixo contínuo (um arquivo cobre o intervalo inteiro); Anton, Archivo
 * Black e Bebas Neue são **estáticas de um peso só** — é por isso que
 * `pesoSuportado()` existe: sem ele o controle de peso parecia quebrado
 * exatamente nessas três, porque o Chromium sintetiza negrito e o resultado
 * é quase idêntico.
 */
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";
import type { FontFamilyId } from "./settings";

export type { FontFamilyId };

export type FamiliaDeFonte = {
  id: FontFamilyId;
  /** O valor de `fontFamily` no CSS. Igual no preview e no render. */
  family: string;
  rotulo: string;
  arquivo: string;
  /** Intervalo de peso que o arquivo cobre. Iguais quando a fonte é estática. */
  pesoMin: number;
  pesoMax: number;
  /** Fallback genérico, para o caso de o WOFF2 não chegar. */
  fallback: string;
};

export const FONTES: FamiliaDeFonte[] = [
  {
    id: "bricolage",
    family: "Bricolage Grotesque",
    rotulo: "Bricolage",
    arquivo: "fonts/bricolage-grotesque.woff2",
    pesoMin: 200,
    pesoMax: 800,
    fallback: "sans-serif",
  },
  {
    id: "space-grotesk",
    family: "Space Grotesk",
    rotulo: "Space Grotesk",
    arquivo: "fonts/space-grotesk.woff2",
    pesoMin: 300,
    pesoMax: 700,
    fallback: "sans-serif",
  },
  {
    id: "source-serif",
    family: "Source Serif 4",
    rotulo: "Source Serif",
    arquivo: "fonts/source-serif-4.woff2",
    pesoMin: 200,
    pesoMax: 900,
    fallback: "serif",
  },
  {
    id: "playfair",
    family: "Playfair Display",
    rotulo: "Playfair",
    arquivo: "fonts/playfair-display.woff2",
    pesoMin: 400,
    pesoMax: 900,
    fallback: "serif",
  },
  {
    id: "jetbrains",
    family: "JetBrains Mono",
    rotulo: "JetBrains Mono",
    arquivo: "fonts/jetbrains-mono.woff2",
    pesoMin: 100,
    pesoMax: 800,
    fallback: "monospace",
  },
  {
    id: "anton",
    family: "Anton",
    rotulo: "Anton",
    arquivo: "fonts/anton.woff2",
    pesoMin: 400,
    pesoMax: 400,
    fallback: "sans-serif",
  },
  {
    id: "archivo-black",
    family: "Archivo Black",
    rotulo: "Archivo Black",
    arquivo: "fonts/archivo-black.woff2",
    pesoMin: 400,
    pesoMax: 400,
    fallback: "sans-serif",
  },
  {
    id: "bebas",
    family: "Bebas Neue",
    rotulo: "Bebas Neue",
    arquivo: "fonts/bebas-neue.woff2",
    pesoMin: 400,
    pesoMax: 400,
    fallback: "sans-serif",
  },
];

export const FONTE_PADRAO: FontFamilyId = "bricolage";

export function familiaPorId(id: string): FamiliaDeFonte {
  return FONTES.find((f) => f.id === id) ?? FONTES[0];
}

/** Peso que esta família realmente entrega, limitado ao eixo que ela tem. */
export function pesoSuportado(familia: FamiliaDeFonte, peso: number): number {
  return Math.min(familia.pesoMax, Math.max(familia.pesoMin, peso));
}

/** `fontFamily` pronto para o style, com o fallback genérico junto. */
export function pilhaDeFonte(familia: FamiliaDeFonte): string {
  return `"${familia.family}", ${familia.fallback}`;
}

/** true quando o controle de peso não tem efeito nenhum nesta família. */
export function pesoEhFixo(familia: FamiliaDeFonte): boolean {
  return familia.pesoMin === familia.pesoMax;
}

let carregadas = false;

/**
 * Carrega todas as famílias, incondicionalmente.
 *
 * São WOFF2 de dezenas de KB — carregar todas de uma vez faz trocar de fonte
 * no editor ser instantâneo, e o render nunca depende de qual família as
 * settings escolheram.
 *
 * A guarda de `document` existe porque o Next PRÉ-RENDERIZA componentes de
 * cliente no servidor, onde este módulo é avaliado em Node — `FontFace` não
 * existe lá, e `next build` quebraria sem a guarda.
 */
export function carregarFontes(): void {
  if (carregadas || typeof document === "undefined") return;
  carregadas = true;

  for (const familia of FONTES) {
    void loadFont({
      family: familia.family,
      url: staticFile(familia.arquivo),
      format: "woff2",
      // Um arquivo variável precisa declarar o INTERVALO: declarado como um
      // peso só, o Chromium trava a instância nesse peso e o controle de peso
      // deixa de ter efeito.
      weight:
        familia.pesoMin === familia.pesoMax
          ? String(familia.pesoMin)
          : `${familia.pesoMin} ${familia.pesoMax}`,
    });
  }
}
