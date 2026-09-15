/**
 * Movimento da INTENSIDADE do efeito, ao longo do tempo.
 *
 * Um efeito de intensidade fixa cansa: depois de dez segundos o olho para de
 * vê-lo. Fazer a intensidade respirar devolve presença sem precisar de um
 * efeito mais forte — que é o caminho que costuma acabar cobrindo a letra.
 *
 * Função PURA do relógio e do pulso: nada de estado entre quadros, nada de
 * `Math.random`. O Remotion pede quadro fora de ordem e em paralelo, e um
 * valor que dependesse do quadro anterior daria vídeo diferente a cada render.
 *
 * Vale para os dois caminhos de efeito — o shader (`gl/uniformes.ts`) e a
 * textura de CSS (`layers/Fundo.tsx`) —, por isso mora aqui e não dentro de
 * um deles.
 */
import type { VideoSettings } from "../settings";

export type MovimentoId = "none" | "senoide" | "deriva" | "batida";

export const MOVIMENTOS: { id: MovimentoId; rotulo: string; dica: string }[] = [
  { id: "none", rotulo: "Parado", dica: "A intensidade não muda" },
  { id: "senoide", rotulo: "Senoidal", dica: "Vai e volta num ritmo regular" },
  { id: "deriva", rotulo: "Deriva", dica: "Vagueia sem repetir, como maré" },
  { id: "batida", rotulo: "Na batida", dica: "Acompanha o pulso da música" },
];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Período da oscilação, em ms. Velocidade alta = período curto. */
function periodoMs(velocidade: number): number {
  return 12_000 * (1 - clamp(velocidade, 0, 1)) + 1_200 * clamp(velocidade, 0, 1);
}

/**
 * O fator do movimento neste instante, de 0 a 1.
 *
 * Separado de `intensidadeComMovimento` para poder ser testado sozinho: é aqui
 * que mora a forma de onda de cada modo.
 */
export function fatorDoMovimento(
  modo: MovimentoId,
  ms: number,
  velocidade: number,
  pulso: number,
): number {
  if (modo === "none") return 1;
  if (modo === "batida") return clamp(pulso, 0, 1);

  const t = ms / periodoMs(velocidade);

  if (modo === "senoide") {
    return 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
  }

  // Deriva: três senoides de períodos incomensuráveis. A soma não repete num
  // intervalo que dê para perceber, e continua sendo função pura do relógio —
  // um ruído de verdade exigiria estado, que aqui é proibido.
  const a = Math.sin(t * Math.PI * 2);
  const b = Math.sin(t * Math.PI * 2 * 0.37 + 1.7);
  const c = Math.sin(t * Math.PI * 2 * 0.21 + 4.1);
  return clamp(0.5 + (a * 0.5 + b * 0.32 + c * 0.18) * 0.5, 0, 1);
}

/**
 * A intensidade que o efeito deve usar neste quadro.
 *
 * A profundidade diz quanto do valor escolhido pode ser tirado: em 1, o efeito
 * chega a sumir e volta inteiro; em 0, nada se move. Nunca passa do valor
 * escolhido no painel — o movimento tira, não acrescenta, para que o ajuste do
 * usuário continue sendo o teto do que ele vai ver.
 */
export function intensidadeComMovimento(
  style: VideoSettings["style"],
  ms: number,
  pulso: number,
): number {
  const base = clamp(style.textureIntensity, 0, 1);
  const profundidade = clamp(style.movimentoProfundidade, 0, 1);
  if (style.movimento === "none" || profundidade === 0) return base;

  const fator = fatorDoMovimento(style.movimento, ms, style.movimentoVelocidade, pulso);
  return clamp(base * (1 - profundidade + profundidade * fator), 0, 1);
}
