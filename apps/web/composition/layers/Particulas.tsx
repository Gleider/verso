import { useLayoutEffect, useRef } from "react";
import { DESIGN } from "../formato";
import { desenharParticulas, modoDaParticula } from "../gl/particulas";
import { corParaRgb } from "../gl/uniformes";
import type { VideoSettings } from "../settings";

type Props = {
  settings: VideoSettings;
  ms: number;
  pulso: number;
};

/**
 * A camada de partículas: um canvas transparente, uma passada de shader.
 *
 * É camada PRÓPRIA, e não mais uma textura, porque partícula soma em vez de
 * substituir — "granulado + neve" faz sentido, e o catálogo de textura só
 * deixa escolher uma. Por isso também tem `camada` própria: pode ficar atrás
 * da letra (ambiente) ou à frente (neve caindo na frente do texto).
 *
 * Desenho síncrono no `useLayoutEffect`, sem array de dependências: cada
 * quadro é um render novo, e cada render redesenha.
 */
export function Particulas({ settings, ms, pulso }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const design = DESIGN[settings.output.aspectRatio];
  const p = settings.particulas;

  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    desenharParticulas(canvas, {
      tamanho: [design.width, design.height],
      ms,
      pulso: pulso * p.reacaoBatida,
      modo: modoDaParticula(p.tipo),
      densidade: p.quantidade,
      tamanhoDaParticula: p.tamanho,
      velocidade: 0.2 + p.velocidade * 1.8,
      opacidade: p.opacidade,
      cor: p.cor ? corParaRgb(p.cor) : null,
    });
  });

  return (
    <canvas
      ref={ref}
      width={design.width}
      height={design.height}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
        pointerEvents: "none",
      }}
    />
  );
}
