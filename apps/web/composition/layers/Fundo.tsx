import { AbsoluteFill, Img, staticFile } from "remotion";
import { estadoAmbiente } from "../ambiente";
import { combinarFiltros, filtroDeCor } from "../efeitos/cor";
import { fundoPorId } from "../efeitos/fundos";
import { ESTADO_CSS_NEUTRO, texturaCssPorId } from "../efeitos/texturas-css";
import { DESIGN } from "../formato";
import { precisaDeGl } from "../gl/uniformes";
import { Tela } from "./Tela";
import { Textura } from "./Textura";
import type { VideoSettings } from "../settings";

type Props = {
  settings: VideoSettings;
  ms: number;
  pulso: number;
  src: string | null;
};

/**
 * Fundo da composição: imagem enviada, foto ou fundo gerado da biblioteca, ou
 * cor sólida.
 *
 * **O canvas é opcional, e essa é a decisão de desempenho da tela.** Medido:
 * cada passe de shader custa ~7 ms num quadro de 1080p, e o preview cai de 60
 * para 31 fps com sete passes. Então o canvas só entra quando há shader de
 * verdade para rodar — fundo gerado ou textura que precisa amostrar pixels.
 *
 * No caminho comum — cor sólida ou foto, com textura CSS ou nenhuma — o fundo
 * é um `<div>` ou um `<Img>`, a gradação de cor é um `filter` de CSS e as
 * texturas são camadas por cima. Tudo isso o navegador compõe na GPU sem
 * custo por quadro, e o preview fica em 60 fps cravados.
 *
 * O movimento ambiente fica FORA do canvas, num `<div>` com `transform`: é
 * geometria da camada, não pixel. A escala vem de `escalaSegura()`, que
 * garante cobertura — antes era margem fixa e a deriva mostrava tarja preta.
 */
export function Fundo({ settings, ms, pulso, src }: Props) {
  const { background } = settings;
  const design = DESIGN[settings.output.aspectRatio];
  const proporcao = design.width / design.height;

  const ambiente = estadoAmbiente(
    background.ambient,
    ms,
    pulso,
    background.ambientIntensity,
    background.reacaoBatida,
    proporcao,
  );

  const daBiblioteca = background.kind === "library" ? fundoPorId(background.ref) : null;

  // Três origens de imagem, uma só camada: o envio do usuário, a capa e as
  // fotos da biblioteca. `staticFile()` resolve dos dois lados — `/fundos/...`
  // no preview dentro do Next, e dentro do bundle no render.
  const enviada = (background.kind === "upload" || background.kind === "cover") && src !== null;
  const arquivoDaFoto = daBiblioteca?.arquivo ? staticFile(daBiblioteca.arquivo) : null;
  const imagem = enviada ? (src as string) : arquivoDaFoto;

  const usaGl = precisaDeGl(settings);

  const estadoCss =
    texturaCssPorId(settings.style.texture)?.estado(ms, settings.style.textureIntensity, pulso) ??
    ESTADO_CSS_NEUTRO;

  const camada: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    transform: ambiente.transform,
    transformOrigin: "50% 50%",
    // Gradação de cor e o filtro da textura CSS, os dois de graça no
    // compositor. Trocar esta string não redesenha nada.
    filter: combinarFiltros(filtroDeCor(background, pulso), estadoCss.filtro),
    willChange: "transform",
  };

  const corDeBase = daBiblioteca?.base ?? background.color;

  return (
    <AbsoluteFill style={{ backgroundColor: corDeBase, overflow: "hidden" }}>
      <div style={camada}>
        {usaGl ? (
          <Tela settings={settings} ms={ms} pulso={pulso} src={imagem} />
        ) : imagem ? (
          <Img src={imagem} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", backgroundColor: corDeBase }} />
        )}
      </div>

      {/* As sobreposições não acompanham o movimento do fundo: grão e poeira
          são da "película", não da imagem. */}
      <Textura estado={estadoCss} />

      {background.darken > 0 && (
        <AbsoluteFill
          style={{ backgroundColor: `rgba(0,0,0,${Math.min(1, Math.max(0, background.darken))})` }}
        />
      )}
    </AbsoluteFill>
  );
}
