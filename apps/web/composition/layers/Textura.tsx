import { AbsoluteFill, Img } from "remotion";
import { texturaPorId } from "../textures";
import type { VideoSettings } from "../settings";

// Mesma textura de ruído de `app/globals.css` (.fx-noise): um SVG embutido,
// sem requisição de rede. Aqui é referenciado direto, sem `className`, porque
// o bundle do Remotion não carrega o CSS global do Next.
const RUIDO_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.85'/%3E%3C/svg%3E";

type Props = {
  settings: VideoSettings;
  ms: number;
  pulso: number;
  /** Só usada pela textura `vhs`, para a cópia de croma deslocada. */
  src: string | null;
};

/** Aplica a textura escolhida por cima do fundo, abaixo da letra. */
export function Textura({ settings, ms, pulso, src }: Props) {
  const textura = texturaPorId(settings.style.texture);
  const estado = textura(ms, settings.style.textureIntensity, pulso);

  const semEfeito =
    estado.filter === "none" &&
    estado.granulado === 0 &&
    estado.varredura === 0 &&
    estado.reticula === 0 &&
    estado.vinheta === 0 &&
    estado.croma === null;

  if (semEfeito) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {estado.croma && src && (
        <Img
          src={src}
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            mixBlendMode: "screen",
            filter: "sepia(1) saturate(6) hue-rotate(-28deg)",
            transform: estado.croma.transform,
            opacity: estado.croma.opacity,
          }}
        />
      )}

      {estado.granulado > 0 && (
        <AbsoluteFill
          style={{
            backgroundImage: `url("${RUIDO_SVG}")`,
            backgroundRepeat: "repeat",
            backgroundPosition: `${estado.deslocamento.x}px ${estado.deslocamento.y}px`,
            mixBlendMode: "overlay",
            opacity: estado.granulado,
          }}
        />
      )}

      {estado.varredura > 0 && (
        <AbsoluteFill
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, rgba(0,0,0,0.55) 0px, rgba(0,0,0,0.55) 1px, transparent 1px, transparent 3px)",
            opacity: estado.varredura,
          }}
        />
      )}

      {estado.reticula > 0 && (
        <AbsoluteFill
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(0,0,0,0.6) 1px, transparent 1.2px)",
            backgroundSize: "4px 4px",
            opacity: estado.reticula,
          }}
        />
      )}

      {estado.vinheta > 0 && (
        <AbsoluteFill
          style={{
            backgroundImage:
              "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.9) 100%)",
            opacity: estado.vinheta,
          }}
        />
      )}

      {estado.faixa && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${estado.faixa.y}%`,
            height: `${estado.faixa.height}%`,
            transform: `translateX(${estado.faixa.shift}%)`,
            background:
              "linear-gradient(to bottom, rgba(255,255,255,0.02), rgba(255,255,255,0.16), rgba(255,255,255,0.02))",
          }}
        />
      )}
    </AbsoluteFill>
  );
}
