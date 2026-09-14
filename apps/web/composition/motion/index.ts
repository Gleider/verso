import { bubbling } from "./bubbling";
import { fade } from "./fade";
import { fill } from "./fill";
import { mask } from "./mask";
import { popup } from "./popup";
import { scaling } from "./scaling";
import { slide } from "./slide";
import { estatico } from "./static";
import { wipe } from "./wipe";
import type { ModoDeMovimento } from "./tipos";
import type { MotionId } from "../settings";

export const MODOS: Record<MotionId, ModoDeMovimento> = {
  fill,
  fade,
  slide,
  wipe,
  popup,
  scaling,
  mask,
  bubbling,
  static: estatico,
};

/** Nunca quebra por um `MotionId` inválido (dado antigo ou corrompido). */
export function modoDeMovimento(id: MotionId): ModoDeMovimento {
  return MODOS[id] ?? fill;
}

export type { EntradaDeSegmento, EntradaDeVerso, EstiloDeSegmento, EstiloDeVerso, ModoDeMovimento } from "./tipos";
