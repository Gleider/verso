/**
 * O desenho do visualizador de áudio, como DADO.
 *
 * Nada de canvas: um punhado de barras é DOM comum, composto pela GPU do
 * navegador sem custo por quadro — a mesma regra que fez o preview voltar a
 * 60 fps (`pitfalls.md` §28). `layers/Visualizador.tsx` só escreve `style`.
 *
 * Funções puras do espectro: mesma entrada, mesma saída. O espectro já vem
 * pré-computado por quadro de `audio/envelope.ts`, então aqui não há estado
 * nem análise — só geometria.
 */
import { N_BANDAS } from "./audio/envelope";
import type { AnaliseDeAudio } from "./audio/envelope";
import type { VideoSettings } from "./settings";

export type FormaDoVisualizador =
  | { tipo: "barras"; alturas: number[] }
  | { tipo: "onda"; pontos: { x: number; y: number }[] }
  | { tipo: "circular"; raios: number[] }
  | { tipo: "anel"; escala: number };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** As faixas deste quadro, 0..1. Vazio quando o áudio ainda não decodificou. */
export function bandasDoQuadro(analise: AnaliseDeAudio | null, quadro: number): number[] {
  if (!analise) return [];
  const total = analise.bandas.length / N_BANDAS;
  const q = clamp(Math.floor(quadro), 0, Math.max(0, total - 1));
  const saida: number[] = new Array(N_BANDAS);
  for (let f = 0; f < N_BANDAS; f += 1) saida[f] = analise.bandas[q * N_BANDAS + f];
  return saida;
}

/**
 * Suaviza entre faixas VIZINHAS (não no tempo).
 *
 * No tempo seria estado entre quadros, proibido aqui — o Remotion renderiza
 * fora de ordem. No espaço é só uma média de três, e é o que impede o
 * visualizador de virar um pente de picos isolados.
 */
function suavizar(v: number[]): number[] {
  return v.map((atual, i) => {
    const antes = v[i - 1] ?? atual;
    const depois = v[i + 1] ?? atual;
    return (antes + atual * 2 + depois) / 4;
  });
}

/**
 * Onde ficavam a curva de exibição (um cubo) e o realce de agudos.
 *
 * Os dois existiam para compensar a saturação da escala do detector de
 * batida: quase metade das faixas chegava em 1,0, e o cubo derrubava isso
 * para um valor desenhável. Era remendo em cima de análise errada — e não
 * resolvia, porque 1³ continua 1: as faixas grudadas no teto seguiam
 * grudadas, e só as agudas se mexiam.
 *
 * Com `normalizarParaExibicao()` em `audio/bandas.ts`, cada faixa já chega
 * com o próprio alcance espalhado em 0..1, medido ao longo da música. Curvar
 * de novo aqui só tiraria a reatividade que aquilo acabou de devolver, e o
 * realce de agudos ficou sem função: a normalização por faixa já corrige a
 * inclinação natural do espectro.
 */

/** Altura da barra quando a reação está em zero: parada, discreta. */
const REPOUSO = 0.18;

/**
 * Quanto o desenho reage ao áudio — e é isto que o controle do painel ajusta.
 *
 * Duas medidas guiaram esta forma. A primeira: a normalização de exibição
 * (`audio/bandas.ts`) derrubou a saturação de 28% das amostras no teto para
 * 7,6%, e foi o que tirou a linha reta. A segunda: mesmo assim o movimento
 * quadro a quadro não mudou (0,093 contra 0,088 de escala cheia), porque as
 * faixas passam a maior parte do tempo perto da média e pico e rotina ficam à
 * mesma altura. Espalhar a escala não basta; falta contraste.
 *
 * O expoente dá o contraste: uma faixa na média (0,6) cai para 0,41 enquanto
 * o pico continua em 1,0, e a distância entre os dois quase dobra.
 *
 * A mistura com o repouso é o que faz o controle ser monótono. Uma primeira
 * versão usava o expoente como o próprio controle, e o resultado era um
 * ajuste que ENCOLHIA o visualizador conforme se aumentava — em zero as
 * barras ficavam altas e fiéis, em um ficavam mais baixas e nervosas. Um
 * controle que anda para trás é pior do que um controle sem contraste.
 */
function reagir(v: number[], intensidade: number): number[] {
  const i = clamp(intensidade, 0, 1);
  return v.map((x) => clamp(REPOUSO * (1 - i) + clamp(x, 0, 1) ** 1.8 * i, 0, 1));
}

export function formaDoVisualizador(
  settings: VideoSettings,
  analise: AnaliseDeAudio | null,
  quadro: number,
  pulso: number,
): FormaDoVisualizador | null {
  const { tipo, intensidade } = settings.visualizer;
  if (tipo === "none") return null;

  const i = clamp(intensidade, 0, 1);
  const cruas = bandasDoQuadro(analise, quadro);
  // Sem áudio decodificado, um repouso discreto em vez de tela vazia: o
  // editor abre antes de o áudio ficar pronto, e um visualizador sumido ali
  // parece defeito.
  const bandas =
    cruas.length > 0
      ? reagir(suavizar(cruas), i)
      : new Array(N_BANDAS).fill(0.04);

  if (tipo === "anel") {
    return { tipo: "anel", escala: 1 + clamp(pulso, 0, 1) * 0.55 * i };
  }

  if (tipo === "onda") {
    // Espelha o espectro em torno do centro: é o que dá a silhueta simétrica
    // de osciloscópio, em vez de uma rampa.
    const metade = bandas.length;
    const pontos: { x: number; y: number }[] = [];
    for (let k = 0; k < metade * 2; k += 1) {
      const f = k < metade ? bandas[metade - 1 - k] : bandas[k - metade];
      pontos.push({ x: k / (metade * 2 - 1), y: clamp(f, 0, 1) });
    }
    return { tipo: "onda", pontos };
  }

  if (tipo === "circular") {
    return { tipo: "circular", raios: bandas.map((b) => clamp(b, 0, 1)) };
  }

  return { tipo: "barras", alturas: bandas.map((b) => clamp(b, 0, 1)) };
}
