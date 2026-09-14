import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig } from "remotion";
import { useEnvelopeDeBatida } from "./audio/useEnvelope";
import { carregarFontes } from "./fonts";
import { DESIGN, escalaDeDesign } from "./formato";
import { Fundo } from "./layers/Fundo";
import { Letra } from "./layers/Letra";
import { Textura } from "./layers/Textura";
import { Veu } from "./layers/Veu";
import { msDoQuadro } from "./tempo";
import type { KaraokeProps } from "./props";

/**
 * Composição raiz do karaokê.
 *
 * Regras duras, válidas para todo `composition/*`: nada de `className` (o
 * bundle do Remotion não carrega `globals.css`/Tailwind), nada de `transition`
 * ou `animation` de CSS (o preview roda sob `prefers-reduced-motion` do Next,
 * o render não), todo movimento é função de `useCurrentFrame()`, e nada de
 * `Math.random` ou estado entre quadros (o Remotion renderiza fora de ordem
 * e em paralelo).
 *
 * Escopo de módulo: roda uma vez por avaliação do bundle. A guarda dentro de
 * `carregarFontes()` existe porque o Next PRÉ-RENDERIZA componentes de
 * cliente no servidor, onde `FontFace` não existe.
 */
carregarFontes();

export function Karaoke({ settings, versos, audioUrl, backgroundUrl, duracaoMs }: KaraokeProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = msDoQuadro(frame, fps);

  const envelope = useEnvelopeDeBatida(audioUrl, fps, duracaoMs);
  const pulso = envelope ? (envelope[Math.min(frame, envelope.length - 1)] ?? 0) : 0;

  const design = DESIGN[settings.output.aspectRatio];
  const escala = escalaDeDesign(settings);

  return (
    <AbsoluteFill style={{ backgroundColor: settings.background.color }}>
      <div
        style={{
          width: design.width,
          height: design.height,
          transform: `scale(${escala})`,
          transformOrigin: "top left",
          position: "absolute",
          top: 0,
          left: 0,
          overflow: "hidden",
        }}
      >
        <Fundo settings={settings} ms={ms} pulso={pulso} src={backgroundUrl} />
        <Textura settings={settings} ms={ms} pulso={pulso} src={backgroundUrl} />
        <Veu overlay={settings.style.overlay} />
        <Letra settings={settings} versos={versos} ms={ms} pulso={pulso} backgroundUrl={backgroundUrl} />
      </div>
      {audioUrl && <Audio src={audioUrl} />}
    </AbsoluteFill>
  );
}
