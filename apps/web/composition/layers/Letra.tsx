import { AbsoluteFill } from "remotion";
import { familiaPorId } from "../fonts";
import { TIPOGRAFIA } from "../formato";
import { modoDeMovimento } from "../motion";
import type { EntradaDeSegmento, EntradaDeVerso } from "../motion";
import { paletaPorId } from "../palettes";
import { posicaoNoVerso } from "../preenchimento";
import { indiceDoVersoAtivo, segmentosNaGranularidade } from "../versos";
import { Verso, VersoVizinho } from "./Verso";
import type { AspectRatio, VideoSettings } from "../settings";
import type { VersoPreparado } from "../versos";

type Props = {
  settings: VideoSettings;
  versos: VersoPreparado[];
  ms: number;
  pulso: number;
  /** Só usada pelo modo `mask`, que recorta esta imagem com o texto. */
  backgroundUrl: string | null;
};

const JUSTIFICAR_VERTICAL: Record<VideoSettings["structure"]["lyricsPosition"], React.CSSProperties> = {
  top: { justifyContent: "flex-start", paddingTop: "10%", paddingBottom: 0 },
  center: { justifyContent: "center", paddingTop: 0, paddingBottom: 0 },
  bottom: { justifyContent: "flex-end", paddingTop: 0, paddingBottom: "10%" },
};

/** Posiciona a letra na tela, escolhe o verso ativo e aplica o modo de movimento. */
export function Letra({ settings, versos, ms, pulso, backgroundUrl }: Props) {
  const indice = indiceDoVersoAtivo(versos, ms);
  if (indice < 0) return null;

  const aspectRatio: AspectRatio = settings.output.aspectRatio;
  const tipografia = TIPOGRAFIA[aspectRatio];
  const familia = familiaPorId(settings.font.family);
  const paleta = paletaPorId(settings.style.palette);
  const modo = modoDeMovimento(settings.motion.animation);

  const atual = versos[indice];
  const anterior = indice > 0 ? versos[indice - 1] : null;
  const proximo = indice < versos.length - 1 ? versos[indice + 1] : null;

  const entradaDeVerso: EntradaDeVerso = {
    msNoVerso: ms - atual.inicioMs,
    duracaoMs: Math.max(1, atual.fimMs - atual.inicioMs),
    entradaMs: settings.motion.durationMs,
    msAbsoluto: ms,
    pulso,
    tweak: settings.motion.tweak,
    indiceDoVerso: indice,
  };
  const estiloDoVerso = modo.verso(entradaDeVerso);

  const segmentosResolvidos = segmentosNaGranularidade(atual, settings.motion.sync);
  const { indiceAtual, preenchimento } = posicaoNoVerso(segmentosResolvidos, ms);
  const segmentosEstilizados = segmentosResolvidos.map((segmento, indiceDoSegmento) => {
    const entradaDeSegmento: EntradaDeSegmento = {
      ...entradaDeVerso,
      indice: indiceDoSegmento,
      total: segmentosResolvidos.length,
      indiceAtual,
      preenchimento,
    };
    return { texto: segmento.texto, estilo: modo.segmento(entradaDeSegmento) };
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
        paddingLeft: tipografia.margemLateral,
        paddingRight: tipografia.margemLateral,
        ...JUSTIFICAR_VERTICAL[settings.structure.lyricsPosition],
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        {anterior && (
          <VersoVizinho
            texto={anterior.texto}
            fontSize={tipografia.tamanho.small}
            fontFamily={familia.family}
            larguraMaxima={tipografia.larguraMaxima}
            uppercase={settings.font.uppercase}
          />
        )}
        <Verso
          segmentos={segmentosEstilizados}
          estiloDoVerso={estiloDoVerso}
          paleta={paleta}
          fontSize={tipografia.tamanho[settings.font.size]}
          fontWeight={settings.font.weight}
          fontFamily={familia.family}
          lineHeight={settings.font.lineHeight}
          alignH={settings.font.alignH}
          uppercase={settings.font.uppercase}
          larguraMaxima={tipografia.larguraMaxima}
          backgroundUrl={backgroundUrl}
        />
        {proximo && (
          <VersoVizinho
            texto={proximo.texto}
            fontSize={tipografia.tamanho.small}
            fontFamily={familia.family}
            larguraMaxima={tipografia.larguraMaxima}
            uppercase={settings.font.uppercase}
          />
        )}
      </div>
    </AbsoluteFill>
  );
}
