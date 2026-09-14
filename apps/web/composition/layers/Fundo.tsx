import { AbsoluteFill, Img } from "remotion";
import { effectFrame } from "../../lib/effects";
import type { EffectId } from "../../lib/effects";
import type { AmbientId, VideoSettings } from "../settings";

/**
 * Traduz o movimento ambiente do editor para o catálogo de `lib/effects.ts`.
 *
 * `"drift"` ainda não tem implementação própria — cai em `"breathe"` até a
 * etapa 3/4 decidir a diferença visual entre os dois. Nunca crasha por causa
 * de um valor de settings desconhecido: o mesmo espírito do fallback em
 * `effectFrame` para um `effect` inválido.
 */
function ambientParaEffectId(ambient: AmbientId): EffectId {
  if (ambient === "drift") return "breathe";
  return ambient;
}

type Props = {
  settings: VideoSettings;
  ms: number;
  pulso: number;
  src: string | null;
};

/** Fundo da composição: imagem ou cor, com o movimento ambiente e o véu. */
export function Fundo({ settings, ms, pulso, src }: Props) {
  const { background } = settings;
  const frame = effectFrame(
    ambientParaEffectId(background.ambient),
    ms,
    pulso,
    background.ambientIntensity,
  );

  const temImagem = background.kind !== "color" && src !== null;
  const filtroBase = background.blur > 0 ? `blur(${background.blur}px)` : "";
  const filtro = [frame.filter === "none" ? "" : frame.filter, filtroBase]
    .filter(Boolean)
    .join(" ");

  return (
    <AbsoluteFill style={{ backgroundColor: background.color, overflow: "hidden" }}>
      {temImagem && (
        <Img
          src={src as string}
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: frame.transform,
            filter: filtro || "none",
          }}
        />
      )}
      {background.darken > 0 && (
        <AbsoluteFill
          style={{ backgroundColor: `rgba(0,0,0,${Math.min(1, Math.max(0, background.darken))})` }}
        />
      )}
    </AbsoluteFill>
  );
}
