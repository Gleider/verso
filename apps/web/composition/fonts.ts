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
 * Catálogo desta etapa: as três famílias que já são a identidade visual do
 * Verso (`app/globals.css`), como WOFF2 reais baixados do Google Fonts (SIL
 * OFL). O catálogo cresce por DADO — acrescentar uma entrada e o arquivo —,
 * nunca por mudança de mecanismo; é o que a etapa 3 faz para completar as
 * oito famílias da spec.
 */
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

export type FontFamilyId = "bricolage" | "source-serif" | "jetbrains";

export type PesoDeFonte = {
  weight: number;
  arquivo: string;
};

export type FamiliaDeFonte = {
  id: FontFamilyId;
  /** O valor de `fontFamily` no CSS. Igual no preview e no render. */
  family: string;
  rotulo: string;
  pesos: PesoDeFonte[];
};

export const FONTES: FamiliaDeFonte[] = [
  {
    id: "bricolage",
    family: "Bricolage Grotesque",
    rotulo: "Bricolage",
    // Fonte variável: o mesmo arquivo cobre 400 e 800 — o FontFace descreve
    // o peso pedido, e o Chromium escolhe a instância certa dentro do eixo.
    pesos: [
      { weight: 400, arquivo: "fonts/bricolage-grotesque.woff2" },
      { weight: 800, arquivo: "fonts/bricolage-grotesque.woff2" },
    ],
  },
  {
    id: "source-serif",
    family: "Source Serif 4",
    rotulo: "Source Serif",
    pesos: [{ weight: 400, arquivo: "fonts/source-serif-4.woff2" }],
  },
  {
    id: "jetbrains",
    family: "JetBrains Mono",
    rotulo: "JetBrains Mono",
    pesos: [
      { weight: 400, arquivo: "fonts/jetbrains-mono.woff2" },
      { weight: 700, arquivo: "fonts/jetbrains-mono.woff2" },
    ],
  },
];

export const FONTE_PADRAO: FontFamilyId = "bricolage";

export function familiaPorId(id: string): FamiliaDeFonte {
  return FONTES.find((f) => f.id === id) ?? FONTES[0];
}

let carregadas = false;

/**
 * Carrega todas as famílias, incondicionalmente.
 *
 * São poucos WOFF2 de dezenas de KB — carregar todas de uma vez faz trocar de
 * fonte no editor ser instantâneo, e o render nunca depende de qual família
 * as settings escolheram.
 *
 * A guarda de `document` existe porque o Next PRÉ-RENDERIZA componentes de
 * cliente no servidor, onde este módulo é avaliado em Node — `FontFace` não
 * existe lá, e `next build` quebraria sem a guarda.
 */
export function carregarFontes(): void {
  if (carregadas || typeof document === "undefined") return;
  carregadas = true;

  for (const familia of FONTES) {
    for (const { weight, arquivo } of familia.pesos) {
      void loadFont({
        family: familia.family,
        url: staticFile(arquivo),
        format: "woff2",
        weight: String(weight),
      });
    }
  }
}
