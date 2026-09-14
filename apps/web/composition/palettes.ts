/**
 * Combinações de cor nomeadas: texto por cantar, texto cantado, contorno e
 * véu de fundo. A primeira é a identidade do Verso — as mesmas cores de
 * `--kw-sung`/`--kw-unsung` em `app/globals.css` — e as demais partem dela.
 */
export type Paleta = {
  id: string;
  rotulo: string;
  sung: string;
  unsung: string;
  contorno: string;
};

export const PALETAS: Paleta[] = [
  {
    id: "estudio",
    rotulo: "Estúdio",
    sung: "rgb(232, 163, 61)",
    unsung: "rgba(230, 238, 239, 0.92)",
    contorno: "rgba(0, 0, 0, 0.35)",
  },
  {
    id: "fita",
    rotulo: "Fita",
    sung: "rgb(245, 185, 89)",
    unsung: "rgba(220, 228, 233, 0.85)",
    contorno: "rgba(20, 10, 30, 0.45)",
  },
  {
    id: "meia-noite",
    rotulo: "Meia-noite",
    sung: "rgb(126, 178, 232)",
    unsung: "rgba(220, 228, 240, 0.85)",
    contorno: "rgba(0, 0, 10, 0.5)",
  },
  {
    id: "papel",
    rotulo: "Papel",
    sung: "rgb(180, 96, 52)",
    unsung: "rgba(60, 48, 38, 0.85)",
    contorno: "rgba(255, 250, 240, 0.4)",
  },
  {
    id: "neon-frio",
    rotulo: "Neon frio",
    sung: "rgb(94, 234, 212)",
    unsung: "rgba(226, 232, 240, 0.85)",
    contorno: "rgba(10, 0, 30, 0.5)",
  },
];

export function paletaPorId(id: string): Paleta {
  return PALETAS.find((p) => p.id === id) ?? PALETAS[0];
}
