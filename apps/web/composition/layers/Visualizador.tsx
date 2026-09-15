import { AbsoluteFill } from "remotion";
import type { CSSProperties } from "react";
import type { FormaDoVisualizador } from "../visualizador";
import type { VideoSettings } from "../settings";

type Props = {
  forma: FormaDoVisualizador;
  visualizer: VideoSettings["visualizer"];
  cor: string;
  /** Dimensões do QUADRO em pixels de projeto — ver o comentário do traço. */
  design: { width: number; height: number };
};

const ANCORA: Record<VideoSettings["structure"]["lyricsPosition"], CSSProperties> = {
  top: { top: "6%", bottom: "auto" },
  center: { top: "50%", bottom: "auto", transform: "translateY(-50%)" },
  bottom: { bottom: "6%", top: "auto" },
};

/**
 * O visualizador de áudio, em DOM.
 *
 * Sem canvas de propósito: trinta e duas barras são trinta e dois `<div>` com
 * `transform`, que o navegador compõe na GPU sem custo por quadro. Um canvas
 * aqui pagaria o preço medido em `pitfalls.md` §28 por um desenho que o
 * compositor faz de graça.
 *
 * Este `.tsx` não calcula nada: a geometria vem pronta de `visualizador.ts`.
 */
export function Visualizador({ forma, visualizer, cor, design }: Props) {
  // Forma redonda ignora `largura`: numa caixa de 1536x194 o círculo encolhe
  // até caber na altura e fica um botão perdido no meio da tela. A largura
  // vira a própria altura, em pixels, e o desenho usa a caixa inteira.
  const redondo = forma.tipo === "circular" || forma.tipo === "anel";
  const larguraPct = redondo
    ? visualizer.tamanho * 100 * (design.height / design.width)
    : visualizer.largura * 100;

  const caixa: CSSProperties = {
    position: "absolute",
    left: "50%",
    width: `${larguraPct}%`,
    height: `${visualizer.tamanho * 100}%`,
    marginLeft: `${-larguraPct / 2}%`,
    opacity: visualizer.opacidade,
    ...ANCORA[visualizer.posicao],
    ...(visualizer.posicao === "center"
      ? { transform: "translateY(-50%)" }
      : {}),
    ...(visualizer.espelhado ? { scale: "1 -1" } : {}),
    pointerEvents: "none",
  };

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={caixa}>{desenho(forma, cor, caixaEmPixels(larguraPct, visualizer, design), design)}</div>
    </AbsoluteFill>
  );
}

/**
 * A caixa do visualizador em pixels de PROJETO (1920x1080, ou 1080x1920).
 *
 * O traço do SVG precisa disto. `vectorEffect="non-scaling-stroke"` parecia
 * resolver e fazia o oposto: prendia a espessura em pixels de DISPOSITIVO, e
 * aí a mesma composição saía com um fio grosso no preview pequeno e um fio de
 * cabelo no MP4 em 1080p. É justamente a divergência preview/render que a
 * composição única existe para não permitir. Em pixels de projeto, o Remotion
 * escala tudo junto e as duas saídas ficam iguais.
 */
function caixaEmPixels(
  larguraPct: number,
  visualizer: VideoSettings["visualizer"],
  design: { width: number; height: number },
): { largura: number; altura: number; traco: number } {
  return {
    largura: (design.width * larguraPct) / 100,
    altura: design.height * visualizer.tamanho,
    traco: Math.max(2, Math.round(Math.min(design.width, design.height) * 0.004)),
  };
}

type Caixa = ReturnType<typeof caixaEmPixels>;

function desenho(forma: FormaDoVisualizador, cor: string, caixa: Caixa, design: { width: number; height: number }) {
  if (forma.tipo === "barras") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "0.6%",
          width: "100%",
          height: "100%",
        }}
      >
        {forma.alturas.map((altura, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: "100%",
              backgroundColor: cor,
              borderRadius: "999px",
              // `scaleY` a partir da base: mexer em `height` obrigaria o
              // navegador a refazer o layout a cada quadro; `transform` não.
              transform: `scaleY(${Math.max(0.012, altura).toFixed(4)})`,
              transformOrigin: "bottom",
            }}
          />
        ))}
      </div>
    );
  }

  if (forma.tipo === "onda") {
    const pontos = forma.pontos
      .map(
        (p) =>
          `${(p.x * caixa.largura).toFixed(1)},${((1 - p.y) * caixa.altura).toFixed(1)}`,
      )
      .join(" ");
    return (
      <svg
        viewBox={`0 0 ${caixa.largura.toFixed(0)} ${caixa.altura.toFixed(0)}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: "100%" }}
      >
        <polyline
          points={pontos}
          fill="none"
          stroke={cor}
          strokeWidth={caixa.traco}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (forma.tipo === "circular") {
    const n = forma.raios.length;
    return (
      <svg viewBox="-50 -50 100 100" style={{ width: "100%", height: "100%", overflow: "visible" }}>
        {forma.raios.map((r, i) => {
          const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
          const interno = 16;
          const externo = interno + 4 + r * 28;
          return (
            <line
              key={i}
              x1={(Math.cos(ang) * interno).toFixed(2)}
              y1={(Math.sin(ang) * interno).toFixed(2)}
              x2={(Math.cos(ang) * externo).toFixed(2)}
              y2={(Math.sin(ang) * externo).toFixed(2)}
              stroke={cor}
              strokeWidth={2.2}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          aspectRatio: "1 / 1",
          height: "100%",
          borderRadius: "50%",
          // Pixels de projeto, nunca `vh`: no <Player> o vh é a janela do
          // navegador e no render é outra coisa — a borda sairia com espessura
          // diferente no preview e no MP4.
          border: `${Math.max(2, Math.round(Math.min(design.width, design.height) * 0.006))}px solid ${cor}`,
          transform: `scale(${forma.escala.toFixed(4)})`,
        }}
      />
    </div>
  );
}
