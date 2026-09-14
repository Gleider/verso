/** As seis abas do editor, na ordem da barra lateral. */
export type AbaId = "background" | "font" | "motion" | "structure" | "style" | "templates";

export interface DefinicaoDeAba {
  id: AbaId;
  rotulo: string;
}

export const ABAS: DefinicaoDeAba[] = [
  { id: "background", rotulo: "Background" },
  { id: "font", rotulo: "Font" },
  { id: "motion", rotulo: "Motion" },
  { id: "structure", rotulo: "Structure" },
  { id: "style", rotulo: "Style" },
  { id: "templates", rotulo: "Templates" },
];
