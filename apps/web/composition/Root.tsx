import { Composition } from "remotion";
import type { AnyZodObject } from "remotion";
import { Karaoke } from "./Karaoke";
import { dimensoesDaSaida } from "./formato";
import { SETTINGS_PADRAO } from "./settings";
import { totalDeQuadros } from "./tempo";
import type { KaraokeProps } from "./props";

// Nunca letra real — texto inventado só para o preview padrão do Remotion Studio.
const PROPS_DE_EXEMPLO: KaraokeProps = {
  settings: SETTINGS_PADRAO,
  duracaoMs: 8_000,
  audioUrl: "",
  backgroundUrl: null,
  versos: [
    {
      id: "1",
      texto: "verso de exemplo, nunca letra real",
      inicioMs: 0,
      fimMs: 4_000,
      segmentos: [{ texto: "verso de exemplo, nunca letra real", s: 0, e: 4_000 }],
      palavras: [{ texto: "verso de exemplo, nunca letra real", s: 0, e: 4_000 }],
    },
    {
      id: "2",
      texto: "segundo verso inventado para o teste",
      inicioMs: 4_000,
      fimMs: 8_000,
      segmentos: [{ texto: "segundo verso inventado para o teste", s: 4_000, e: 8_000 }],
      palavras: [{ texto: "segundo verso inventado para o teste", s: 4_000, e: 8_000 }],
    },
  ],
};

/**
 * Lida por `selectComposition()` e por `renderMedia()` no render — não pelo
 * `<Player>` do editor, que recebe as dimensões diretamente via
 * `dimensoesDaSaida()` (a mesma função, uma fonte só — etapa 2).
 */
export function metadadosDoKaraoke({ props }: { props: KaraokeProps }) {
  const { width, height } = dimensoesDaSaida(props.settings);
  const fps = props.settings.output.fps;
  return { fps, width, height, durationInFrames: totalDeQuadros(props.duracaoMs, fps) };
}

export const RaizRemotion = () => (
  // Sem schema zod: o par de tipos explícito é o que evita o TypeScript
  // inferir Props como Record<string, unknown> através do tipo condicional
  // InferProps<Schema, Props> (posição não-inferível para o TS).
  <Composition<AnyZodObject, KaraokeProps>
    id="karaoke"
    component={Karaoke}
    defaultProps={PROPS_DE_EXEMPLO}
    calculateMetadata={metadadosDoKaraoke}
    // Obrigatórios pelo tipo; calculateMetadata sobrescreve em toda chamada real.
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={1}
  />
);
