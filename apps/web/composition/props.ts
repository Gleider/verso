/**
 * O que a composição recebe de fora — idêntico no preview e no render.
 *
 * `type`, não `interface`: `<Composition<Schema, Props>>` exige que Props
 * satisfaça `Record<string, unknown>` no ponto de instanciação explícita
 * (Root.tsx), e só um alias de objeto literal ganha o índice implícito que
 * essa checagem aceita — uma interface nomeada não. É exceção pontual à
 * convenção de usar `interface` em props de componente.
 */
import type { VideoSettings } from "./settings";
import type { VersoPreparado } from "./versos";

export type KaraokeProps = {
  settings: VideoSettings;
  versos: VersoPreparado[];
  duracaoMs: number;
  /** URL absoluta. NEXT_PUBLIC_API_URL no preview, INTERNAL_API_URL no render. */
  audioUrl: string;
  /** null quando a faixa não tem fundo enviado. */
  backgroundUrl: string | null;
};
