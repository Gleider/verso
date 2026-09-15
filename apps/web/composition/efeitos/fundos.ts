/**
 * Biblioteca de fundos — só DADO.
 *
 * Os fundos gerados eram pilhas de `@remotion/effects` (3 a 4 passes, cada um
 * copiando 2 MP para o seguinte). O desenho deles mudou para GLSL em
 * `gl/glsl/fundos.ts`, numa passada só; aqui ficou o catálogo: identidade,
 * rótulo, cor de base e a miniatura do painel.
 *
 * `amostra` é CSS de propósito: o cartãozinho do painel é DOM comum, fora da
 * composição, e não vale subir um canvas WebGL para desenhar 40×40 px. Ela
 * aproxima o fundo; quem manda é o shader.
 *
 * Fotos e fundos gerados moram na mesma lista porque, para quem escolhe, são
 * a mesma coisa. Quem distingue é `arquivo`: com ele, o fundo é um arquivo de
 * `public/fundos/` (domínio público ou CC0 — ver `CREDITOS.md`); sem ele, é
 * procedural e `gl/fonte.ts` tem a função correspondente.
 */

export type FundoDaBiblioteca = {
  id: string;
  rotulo: string;
  /** Cor por baixo de tudo, enquanto a imagem carrega. */
  base: string;
  /** Aproximação em CSS, só para a miniatura do painel. */
  amostra: string;
  /** Caminho em `public/` quando o fundo é uma FOTO, não um shader. */
  arquivo?: string;
};

/** Fundo de foto: a imagem já é o visual. */
function daPasta(id: string, rotulo: string, base: string): FundoDaBiblioteca {
  const arquivo = `fundos/${id}.jpg`;
  return { id, rotulo, base, arquivo, amostra: `center / cover no-repeat url(/${arquivo})` };
}

/** Gerados por shader. Os ids batem com `FUNDOS_GERADOS` de `gl/fonte.ts`. */
const GERADOS: FundoDaBiblioteca[] = [
  {
    id: "aurora",
    rotulo: "Aurora",
    base: "#06101a",
    amostra:
      "radial-gradient(60% 45% at 25% 20%, rgba(94,234,212,0.55), transparent 70%), radial-gradient(55% 50% at 78% 30%, rgba(129,140,248,0.5), transparent 70%), linear-gradient(160deg, #06101a, #0d1b2a)",
  },
  {
    id: "brasa",
    rotulo: "Brasa",
    base: "#150603",
    amostra:
      "radial-gradient(65% 55% at 30% 80%, rgba(232,88,32,0.65), transparent 70%), linear-gradient(200deg, #1d0803, #3a1204)",
  },
  {
    id: "oceano",
    rotulo: "Oceano",
    base: "#03121c",
    amostra:
      "radial-gradient(70% 50% at 20% 25%, rgba(56,189,248,0.45), transparent 70%), linear-gradient(190deg, #041a28, #062c3f)",
  },
  {
    id: "neon",
    rotulo: "Neon",
    base: "#0a0414",
    amostra:
      "radial-gradient(55% 45% at 78% 22%, rgba(236,72,153,0.6), transparent 70%), linear-gradient(140deg, #12071f, #1c0a2e)",
  },
  {
    id: "papel",
    rotulo: "Papel",
    base: "#e8dfcc",
    amostra: "linear-gradient(170deg, #efe7d6, #ddd0b6 60%, #cfc0a2)",
  },
  {
    id: "grade",
    rotulo: "Grade",
    base: "#080d10",
    amostra:
      "repeating-linear-gradient(0deg, rgba(232,163,61,0.16) 0 2px, transparent 2px 58px), repeating-linear-gradient(90deg, rgba(232,163,61,0.16) 0 2px, transparent 2px 58px), #0a1114",
  },
  {
    id: "raios",
    rotulo: "Raios",
    base: "#0b0710",
    amostra:
      "repeating-conic-gradient(from 0deg at 50% 55%, rgba(245,185,89,0.14) 0deg 6deg, transparent 6deg 18deg), #150c1c",
  },
  {
    id: "vinil",
    rotulo: "Vinil",
    base: "#141b20",
    amostra:
      "repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0.1) 0 1px, transparent 1px 7px), radial-gradient(60% 60% at 50% 45%, rgba(92,116,130,0.85), transparent 74%), #0b1116",
  },
  {
    id: "vazamento",
    rotulo: "Vazamento",
    base: "#0d0b12",
    amostra: "linear-gradient(120deg, #2a1330, #0d0b12 60%, #3a1a10)",
  },
];

/**
 * As fotos. Existem porque fundo gerado é sempre abstrato, e parte das
 * músicas pede imagem de verdade. Todas de domínio público ou CC0 — ver
 * `public/fundos/CREDITOS.md`.
 */
export const FOTOS: FundoDaBiblioteca[] = [
  daPasta("nebulosa", "Nebulosa", "#0a0a14"),
  daPasta("aurora-real", "Aurora", "#05131c"),
  daPasta("nuvens", "Nuvens", "#8e9196"),
  daPasta("nevoa", "Névoa", "#9aa3a8"),
  daPasta("dunas", "Dunas", "#8a7a63"),
  daPasta("papel-velho", "Papel velho", "#c8b99a"),
  daPasta("cidade-noite", "Cidade à noite", "#0c1016"),
];

/** Tudo que a aba Background oferece: primeiro os gerados, depois as fotos. */
export const BIBLIOTECA: FundoDaBiblioteca[] = [...GERADOS, ...FOTOS];

export const FUNDO_PADRAO = BIBLIOTECA[0].id;

export function fundoPorId(id: string | null): FundoDaBiblioteca {
  return BIBLIOTECA.find((f) => f.id === id) ?? BIBLIOTECA[0];
}
