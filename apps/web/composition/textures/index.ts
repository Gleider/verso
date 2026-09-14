import { poeiraTextura } from "./dust";
import { grao } from "./grain";
import { halftoneTextura } from "./halftone";
import { nenhuma } from "./none";
import { papelTextura } from "./paper";
import { sepiaTextura } from "./sepia";
import { vhs } from "./vhs";
import { vinhetaTextura } from "./vignette";
import type { Textura } from "./tipos";
import type { TextureId } from "../settings";

export const TEXTURAS: Record<TextureId, Textura> = {
  none: nenhuma,
  grain: grao,
  vhs,
  paper: papelTextura,
  sepia: sepiaTextura,
  dust: poeiraTextura,
  halftone: halftoneTextura,
  vignette: vinhetaTextura,
};

/** Nunca quebra por um `TextureId` inválido (dado antigo ou corrompido). */
export function texturaPorId(id: TextureId): Textura {
  return TEXTURAS[id] ?? nenhuma;
}

export type { EstadoDeTextura, Textura } from "./tipos";
export { ESTADO_NEUTRO } from "./tipos";
