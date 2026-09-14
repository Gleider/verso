import { AbsoluteFill } from "remotion";
import type { OverlayId } from "../settings";

const GRADIENTES: Partial<Record<OverlayId, string>> = {
  "scrim-bottom": "linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.7) 100%)",
  "scrim-full": "linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.35))",
  vignette: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.75) 100%)",
};

/** O véu sob o texto — decisão de legibilidade, separada da imagem em si. */
export function Veu({ overlay }: { overlay: OverlayId }) {
  const gradiente = GRADIENTES[overlay];
  if (!gradiente) return null;
  return <AbsoluteFill style={{ backgroundImage: gradiente, pointerEvents: "none" }} />;
}
