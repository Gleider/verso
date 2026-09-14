import { vhsFrame } from "../../lib/effects";
import { ESTADO_NEUTRO } from "./tipos";
import type { EstadoDeTextura, Textura } from "./tipos";

/**
 * Porta `vhsFrame` de `lib/effects.ts` sem reescrever — o `hash()` de lá já é
 * determinístico, e é exatamente o que o Remotion exige.
 *
 * `vhsFrame` também devolve `transform` (zoom/tremor), mas isso é movimento
 * AMBIENTE — trabalho de `layers/Fundo.tsx`, não da textura. Aqui só entram
 * os campos de SUPERFÍCIE: grão, varredura, separação de cor e a falha de
 * rastreamento. O jitter horizontal fica de fora (só sai embutido na
 * `transform` que não usamos aqui) — só o vertical (`jitterY`) sobra para o
 * deslocamento do grão.
 */
export const vhs: Textura = (ms, intensidade, pulso) => {
  const efeito = vhsFrame(ms, pulso, intensidade);

  const estado: EstadoDeTextura = {
    ...ESTADO_NEUTRO,
    filter: efeito.filter,
    granulado: efeito.noise,
    varredura: efeito.scanlines,
    deslocamento: { x: 0, y: efeito.jitterY },
    croma: efeito.chroma,
    faixa: efeito.tracking,
  };
  return estado;
};
