import type { CSSProperties } from "react";
import type { EstiloDeSegmento, EstiloDeVerso } from "../motion";
import type { Paleta } from "../palettes";
import type { EfeitosDeTexto } from "../texto";

type SegmentoEstilizado = { texto: string; estilo: EstiloDeSegmento };

type Props = {
  segmentos: SegmentoEstilizado[];
  estiloDoVerso: EstiloDeVerso;
  paleta: Paleta;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  lineHeight: number;
  alignH: "left" | "center" | "right";
  uppercase: boolean;
  larguraMaxima: number;
  efeitos: EfeitosDeTexto;
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
 *
 * `width: "100%"` não é decoração: sem isso a caixa encolhe até o texto e
 * `textAlign` não tem espaço sobrando para alinhar — o controle de alinhamento
 * parecia quebrado, porque esquerda, centro e direita davam o mesmo resultado.
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
  efeitos,
  backgroundUrl,
}: Props) {
  const baseStyle: CSSProperties = {
    fontFamily,
    fontWeight,
    fontSize,
    lineHeight,
    textAlign: alignH,
    textTransform: uppercase ? "uppercase" : "none",
    width: "100%",
    maxWidth: larguraMaxima,
    marginLeft: "auto",
    marginRight: "auto",
    letterSpacing: efeitos.letterSpacing,
    textShadow: efeitos.textShadow,
    WebkitTextStroke: efeitos.WebkitTextStroke,
    paintOrder: efeitos.paintOrder,
    filter: efeitos.filter,
    opacity: estiloDoVerso.opacity,
    transform: estiloDoVerso.transform,
    clipPath: estiloDoVerso.clipPath ?? undefined,
    willChange: "transform, opacity",
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
              // `pre-wrap` não é enfeite: um `inline-block` DESCARTA o espaço
              // final de dentro dele, e os segmentos carregam o espaço entre
              // palavras no próprio texto. Sem isto, todo modo que transforma
              // segmento (bubbling, e qualquer outro que venha) cola as
              // palavras umas nas outras — "ocachorroatravessou".
              whiteSpace: "pre-wrap",
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

