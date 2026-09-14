import { ESTADO_NEUTRO } from "./tipos";
import type { Textura } from "./tipos";

/** Sem textura: a imagem fica limpa. */
export const nenhuma: Textura = () => ESTADO_NEUTRO;
