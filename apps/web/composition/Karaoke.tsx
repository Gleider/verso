import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig } from "remotion";
import { useAnaliseDeAudio } from "./audio/useEnvelope";
import { carregarFontes } from "./fonts";
import { DESIGN, escalaDeDesign } from "./formato";
import { Fundo } from "./layers/Fundo";
import { Letra } from "./layers/Letra";
import { Particulas } from "./layers/Particulas";
import { Veu } from "./layers/Veu";
import { Visualizador } from "./layers/Visualizador";
import { coresDoTexto } from "./palettes";
import { msDoQuadro } from "./tempo";
import { formaDoVisualizador } from "./visualizador";
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

  // Um só chamador de `useAudioData` em todo o repositório, e uma só FFT: o
  // pulso da batida e o espectro do visualizador saem da mesma análise.
  const analise = useAnaliseDeAudio(audioUrl, fps, duracaoMs);
  const pulso = analise ? (analise.pulso[Math.min(frame, analise.pulso.length - 1)] ?? 0) : 0;

  const design = DESIGN[settings.output.aspectRatio];
  const escala = escalaDeDesign(settings);

  const forma = formaDoVisualizador(settings, analise, frame, pulso);
  const corDoVisualizador = settings.visualizer.cor ?? coresDoTexto(settings.style).sung;
  const temParticulas = settings.particulas.tipo !== "none";

  const visualizador =
    forma === null ? null : (
      <Visualizador
        forma={forma}
        visualizer={settings.visualizer}
        cor={corDoVisualizador}
        design={design}
      />
    );
  const particulas = temParticulas ? (
    <Particulas settings={settings} ms={ms} pulso={pulso} />
  ) : null;

  const atras = settings.visualizer.camada === "atras";
  const particulasAtras = settings.particulas.camada === "atras";

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
        <Veu overlay={settings.style.overlay} />

        {/* A ORDEM aqui é o controle de camada do painel: o que vem antes da
            letra fica atrás dela, o que vem depois fica à frente. */}
        {particulasAtras && particulas}
        {atras && visualizador}

        <Letra settings={settings} versos={versos} ms={ms} pulso={pulso} backgroundUrl={backgroundUrl} />

        {!atras && visualizador}
        {!particulasAtras && particulas}
      </div>
      {audioUrl && <Audio src={audioUrl} />}
    </AbsoluteFill>
  );
}
