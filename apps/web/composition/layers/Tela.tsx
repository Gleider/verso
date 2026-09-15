import { useLayoutEffect, useRef } from "react";
import { desenhar } from "../gl/contexto";
import { useImagemDeFundo } from "../gl/textura";
import { combinacaoDe, uniformesDe } from "../gl/uniformes";
import { DESIGN } from "../formato";
import type { VideoSettings } from "../settings";

type Props = {
  settings: VideoSettings;
  ms: number;
  pulso: number;
  src: string | null;
};

/**
 * O canvas WebGL do fundo. Só entra quando há shader de verdade para rodar.
 *
 * O desenho é SÍNCRONO, dentro do `useLayoutEffect`: quando o React termina o
 * commit, o quadro já está no buffer. É o que dispensa `delayRender` por
 * quadro — e era justamente o `delayRender` da cadeia do `@remotion/effects`
 * que segurava o `<Player>`.
 *
 * Sem array de dependências de propósito: cada quadro é um render novo do
 * React (`useCurrentFrame` muda), e cada render tem que redesenhar.
 */
export function Tela({ settings, ms, pulso, src }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const imagem = useImagemDeFundo(src);
  const design = DESIGN[settings.output.aspectRatio];

  const combinacao = combinacaoDe(settings, imagem !== null);
  const uniformes = uniformesDe(settings, ms, pulso, [design.width, design.height]);

  useLayoutEffect(() => {
    const canvas = ref.current;
    if (canvas) desenhar({ canvas, combinacao, uniformes, imagem });
  });

  return (
    <canvas
      ref={ref}
      width={design.width}
      height={design.height}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
