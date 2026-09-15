/**
 * Movimento contínuo do fundo — o que faz a imagem "viver" sem depender da
 * música. Função pura do tempo: mesma entrada, mesma saída, sempre.
 *
 * A régua de amplitude é a lição de `pitfalls.md` §12: movimento pequeno
 * demais é indistinguível de efeito quebrado. Um zoom de 6% diluído em 30
 * segundos não é percebido; os valores abaixo são deliberadamente generosos,
 * e a intensidade é que puxa para baixo.
 *
 * A escala nunca é escolhida à mão: `escalaSegura()` calcula o mínimo que
 * ainda cobre o quadro depois do deslocamento e da rotação daquele instante.
 * Antes disso a margem era um `inset: -6%` fixo, e qualquer modo que
 * deslocasse mais que isso — a deriva chega a 12% — mostrava tarja preta na
 * borda.
 */
import type { AmbientId } from "./settings";

export type EstadoAmbiente = {
  transform: string;
};

const PERIODO_RESPIRACAO_MS = 14_000;
const PERIODO_DERIVA_X_MS = 19_000;
const PERIODO_DERIVA_Y_MS = 27_000;
const PERIODO_BALANCO_MS = 16_000;
const PERIODO_ZOOM_MS = 42_000;
const PERIODO_PULSO_MS = 2_000;

const clamp = (valor: number, min: number, max: number) => Math.min(max, Math.max(min, valor));

/** Onda triangular suave de 0 a 1 — sobe e desce sem salto no reinício. */
function onda(ms: number, periodoMs: number, fase = 0): number {
  return (1 - Math.cos((2 * Math.PI * ms) / periodoMs + fase)) / 2;
}

/**
 * A menor escala que ainda cobre o quadro inteiro.
 *
 * `deslocX`/`deslocY` são frações do lado (0,12 = 12%); `graus` é a rotação.
 * Sem isto, deslocar ou girar a camada descobre a borda e aparece tarja
 * preta — o defeito some quando a imagem está parada e volta no movimento,
 * que é o tipo de coisa que passa despercebida no preview.
 */
export function escalaSegura(
  graus: number,
  deslocX: number,
  deslocY: number,
  proporcao: number,
): number {
  const r = (Math.abs(graus) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(r));
  const sen = Math.abs(Math.sin(r));

  // Fórmula clássica do "girar sem cantos vazios": o retângulo girado precisa
  // crescer o bastante para conter o retângulo original nos dois eixos.
  const porLargura = cos + sen / proporcao;
  const porAltura = cos + sen * proporcao;
  const porRotacao = Math.max(porLargura, porAltura);

  // Deslocar em t descobre t de um lado; crescer 2t cobre os dois.
  const porDeslocamento = Math.max(1 + 2 * Math.abs(deslocX), 1 + 2 * Math.abs(deslocY));

  // 1% de folga para o arredondamento de subpixel do Chromium.
  return porRotacao * porDeslocamento * 1.01;
}

export const AMBIENTE_PARADO: EstadoAmbiente = { transform: "none" };

function montar(deslocX: number, deslocY: number, graus: number, escalaExtra: number, proporcao: number): EstadoAmbiente {
  const escala = escalaSegura(graus, deslocX, deslocY, proporcao) * escalaExtra;
  const partes = [
    `translate3d(${(deslocX * 100).toFixed(3)}%, ${(deslocY * 100).toFixed(3)}%, 0)`,
    graus !== 0 ? `rotate(${graus.toFixed(3)}deg)` : "",
    `scale(${escala.toFixed(4)})`,
  ].filter(Boolean);
  return { transform: partes.join(" ") };
}

/**
 * O estado do fundo neste instante.
 *
 * `pulso` (0 a 1) vem do envelope de batida; `reacaoBatida` diz quanto dele
 * chega à imagem, para quem quer movimento sem a música empurrando.
 *
 * `proporcao` é largura/altura do espaço de design: a mesma rotação descobre
 * bordas diferentes em 16:9 e em 9:16.
 */
export function estadoAmbiente(
  ambient: AmbientId,
  ms: number,
  pulso: number,
  intensidade: number,
  reacaoBatida: number,
  proporcao: number,
): EstadoAmbiente {
  const i = clamp(intensidade, 0, 1);
  const batida = clamp(pulso, 0, 1) * clamp(reacaoBatida, 0, 1);
  const escalaDaBatida = 1 + batida * 0.09;

  if (ambient === "none") {
    // Mesmo parado, a batida continua valendo: "sem movimento" é sobre a
    // deriva contínua, não sobre ignorar a música.
    return montar(0, 0, 0, escalaDaBatida, proporcao);
  }

  if (ambient === "pulse") {
    // O "pulso" tinha SÓ o termo da batida: numa faixa de grave fraco — ou
    // com a reação à batida baixa — ele ficava numa escala constante e
    // parecia não fazer nada. Agora tem batimento próprio (curva rápida de
    // subida e descida, não um seno mole) e a batida se soma a ele.
    const fase = (ms % PERIODO_PULSO_MS) / PERIODO_PULSO_MS;
    const batimento = Math.exp(-6 * fase) + 0.55 * Math.exp(-6 * Math.abs(fase - 0.5));
    const proprio = 1 + batimento * 0.07 * i;
    return montar(0, 0, 0, proprio * (1 + batida * 0.14), proporcao);
  }

  if (ambient === "drift") {
    // Panorâmica larga: a imagem atravessa o quadro devagar.
    const x = (onda(ms, PERIODO_DERIVA_X_MS) - 0.5) * 0.12 * i;
    const y = (onda(ms, PERIODO_DERIVA_Y_MS, Math.PI / 3) - 0.5) * 0.06 * i;
    return montar(x, y, 0, escalaDaBatida * (1 + 0.05 * i), proporcao);
  }

  if (ambient === "sway") {
    // Balanço: rotação lenta, como câmera na mão.
    const graus = (onda(ms, PERIODO_BALANCO_MS) - 0.5) * 6 * i;
    const x = (onda(ms, PERIODO_DERIVA_X_MS, Math.PI / 2) - 0.5) * 0.04 * i;
    return montar(x, 0, graus, escalaDaBatida, proporcao);
  }

  if (ambient === "zoom") {
    // Ken Burns: aproxima e afasta num ciclo longo.
    const y = (onda(ms, PERIODO_ZOOM_MS) - 0.5) * 0.05 * i;
    const extra = 1 + onda(ms, PERIODO_ZOOM_MS) * 0.34 * i;
    return montar(0, y, 0, extra * escalaDaBatida, proporcao);
  }

  // breathe — o padrão: respiração de escala com deriva suave nos dois eixos.
  const x = (onda(ms, PERIODO_DERIVA_X_MS) - 0.5) * 0.05 * i;
  const y = (onda(ms, PERIODO_DERIVA_Y_MS, Math.PI / 4) - 0.5) * 0.04 * i;
  const extra = 1 + onda(ms, PERIODO_RESPIRACAO_MS) * 0.14 * i;
  return montar(x, y, 0, extra * escalaDaBatida, proporcao);
}
