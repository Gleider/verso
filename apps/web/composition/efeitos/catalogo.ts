/**
 * As duas famílias de textura numa lista só, para o painel.
 *
 * O editor precisa mostrar tudo junto, mas a distinção importa para quem
 * escolhe: a família CSS é composta pela GPU do navegador sem custo por
 * quadro, e a de shader liga uma cadeia de canvas que roda a cada quadro. O
 * painel marca as de shader para que "o preview ficou pesado" seja uma
 * consequência visível de uma escolha, e não um mistério.
 */
import { TEXTURAS } from "./texturas";
import { TEXTURAS_CSS } from "./texturas-css";
import type { TextureId } from "../settings";

export type ItemDeTextura = {
  id: TextureId;
  rotulo: string;
  descricao: string;
  /** `shader` custa uma cadeia de canvas por quadro; `css` não custa nada. */
  tipo: "css" | "shader";
};

export const CATALOGO_DE_TEXTURAS: ItemDeTextura[] = [
  ...TEXTURAS_CSS.map((t) => ({ id: t.id, rotulo: t.rotulo, descricao: t.descricao, tipo: "css" as const })),
  ...TEXTURAS.map((t) => ({ id: t.id, rotulo: t.rotulo, descricao: t.descricao, tipo: "shader" as const })),
];

const POR_ID = new Map(CATALOGO_DE_TEXTURAS.map((t) => [t.id, t]));

/** Nunca quebra por um `TextureId` inválido (dado antigo ou corrompido). */
export function itemDeTextura(id: TextureId): ItemDeTextura {
  return POR_ID.get(id) ?? CATALOGO_DE_TEXTURAS[0];
}
