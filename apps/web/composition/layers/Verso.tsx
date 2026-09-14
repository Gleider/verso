import type { CSSProperties } from "react";
import type { EstiloDeSegmento, EstiloDeVerso } from "../motion";
import type { Paleta } from "../palettes";

type SegmentoEstilizado = { texto: string; estilo: EstiloDeSegmento };

type Props = {
  segmentos: SegmentoEstilizado[];
  estiloDoVerso: EstiloDeVerso;
  paleta: Paleta;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  lineHeight: number;
  alignH: "left" | "center" | "right" | "justify";
  uppercase: boolean;
  larguraMaxima: number;
  /** Só lida quando `estiloDoVerso.recorta` é true (modo `mask`). */
  backgroundUrl: string | null;
};

/**
 * O verso em exibição.
 *
 * Cada segmento (sílaba, palavra ou o verso inteiro, conforme
 * `settings.motion.sync`) é um `<span>` com seu próprio corte de gradiente —
 * a mesma técnica de `--kw-fill` em `app/globals.css`, generalizada de
 * "por palavra" para "pela granularidade escolhida".
 */
export function Verso({
  segmentos,
  estiloDoVerso,
  paleta,
  fontSize,
  fontWeight,
  fontFamily,
  lineHeight,
  alignH,
  uppercase,
  larguraMaxima,
  backgroundUrl,
}: Props) {
  const baseStyle: CSSProperties = {
    fontFamily,
    fontWeight,
    fontSize,
    lineHeight,
    textAlign: alignH,
    textTransform: uppercase ? "uppercase" : "none",
    maxWidth: larguraMaxima,
    opacity: estiloDoVerso.opacity,
    transform: estiloDoVerso.transform,
    clipPath: estiloDoVerso.clipPath ?? undefined,
  };

  if (estiloDoVerso.recorta && backgroundUrl) {
    return (
      <div
        style={{
          ...baseStyle,
          backgroundImage: `url(${backgroundUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          color: "transparent",
        }}
      >
        {segmentos.map((s) => s.texto).join("")}
      </div>
    );
  }

  return (
    <div style={baseStyle}>
      {segmentos.map((segmento, indice) => {
        const corte = `${(segmento.estilo.preenchimento * 100).toFixed(2)}%`;
        return (
          <span
            key={indice}
            style={{
              display: segmento.estilo.transform === "none" ? "inline" : "inline-block",
              opacity: segmento.estilo.opacity,
              transform: segmento.estilo.transform,
              backgroundImage: `linear-gradient(to right, ${paleta.sung} ${corte}, ${paleta.unsung} ${corte})`,
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              color: "transparent",
            }}
          >
            {segmento.texto}
          </span>
        );
      })}
    </div>
  );
}

/** Verso vizinho (anterior/próximo), apagado — só dá contexto. */
export function VersoVizinho({
  texto,
  fontSize,
  fontFamily,
  larguraMaxima,
  uppercase,
}: {
  texto: string;
  fontSize: number;
  fontFamily: string;
  larguraMaxima: number;
  uppercase: boolean;
}) {
  return (
    <div
      style={{
        fontFamily,
        fontWeight: 700,
        fontSize,
        lineHeight: 1.25,
        textAlign: "center",
        textTransform: uppercase ? "uppercase" : "none",
        maxWidth: larguraMaxima,
        color: "rgba(230, 238, 239, 0.4118)",
      }}
    >
      {texto}
    </div>
  );
}
