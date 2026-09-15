/**
 * Tradução entre a escala do `visualizeAudio()` do Remotion e a escala do
 * `AnalyserNode` do navegador, que é contra a qual `lib/beat.ts` foi calibrado.
 *
 * As duas fontes de espectro NÃO são intercambiáveis. O `AnalyserNode` entrega
 * bytes 0–255 numa escala de DECIBÉIS (`255·(dB − minDecibels)/(maxDecibels −
 * minDecibels)`, padrões −100/−30 dB). O `visualizeAudio()` entrega magnitude
 * LINEAR normalizada pelo máximo do arquivo. As constantes de `lib/beat.ts`
 * (`MIN_ENERGY = 0.06`, `THRESHOLD = 1.35`) foram calibradas contra a
 * primeira escala; na segunda, a energia média de uma música fica na ordem de
 * 10⁻³ — sempre abaixo de `MIN_ENERGY`, e o pulso da batida nunca dispara.
 * Falha calada: o vídeo sai sem pulso e nada indica erro.
 */

/** Bins que cobrem [minHz, maxHz]. O bin tem sampleRate/(2·amostras) Hz. */
export function indicesDaBanda(
  sampleRate: number,
  amostras: number,
  minHz: number,
  maxHz: number,
): { de: number; ate: number } {
  const larguraDoBin = sampleRate / (2 * amostras);
  return {
    de: Math.max(1, Math.ceil(minHz / larguraDoBin)),
    ate: Math.min(amostras - 1, Math.floor(maxHz / larguraDoBin)),
  };
}

const MIN_DB = -100;
const MAX_DB = -30;

/** Magnitude linear (0..1, normalizada) -> a escala 0..1 do AnalyserNode. */
export function magnitudeParaEscalaDeAnalisador(magnitude: number): number {
  const db = 20 * Math.log10(Math.max(magnitude, 1e-10));
  return Math.min(1, Math.max(0, (db - MIN_DB) / (MAX_DB - MIN_DB)));
}

/** Magnitude linear em decibéis, com piso para não estourar em log(0). */
export function magnitudeEmDb(magnitude: number): number {
  return 20 * Math.log10(Math.max(magnitude, 1e-9));
}

/**
 * Abaixo disto é silêncio: nada desenha.
 *
 * É o que impede a normalização por faixa de pegar o chiado de uma faixa
 * praticamente muda e esticá-lo até o teto — o visualizador ficaria cheio de
 * barra alta vinda de ruído.
 */
const PISO_ABSOLUTO_DB = -80;
/** Alcance visual de cada faixa, abaixo da própria referência. */
const FAIXA_DB = 36;
/** Alto o bastante para o pico encostar no teto, baixo para não ser outlier. */
const PERCENTIL = 0.92;

/**
 * Normaliza as faixas para EXIBIÇÃO, por faixa, ao longo da música inteira.
 *
 * O problema que isto resolve: as faixas eram guardadas na escala do detector
 * de batida (`magnitudeParaEscalaDeAnalisador`, janela de -100 a -30 dB).
 * Música real tem grave e médio bem acima de -30 dB, então essas faixas
 * **grudavam em 1,0** e só as agudas — que são fracas — ainda se mexiam. O
 * visualizador parecia reagir a poucas frequências, e a onda ficava com o
 * centro reto, porque o centro dela é justamente o grave.
 *
 * Não dá para alargar a janela do detector: ela é calibrada e mexer nela
 * mata o pulso (`pitfalls.md` §17). Então a exibição ganha escala própria.
 *
 * **Por faixa**, e não global: cada faixa usa o próprio alcance, o que também
 * resolve a inclinação natural do espectro (grave forte, agudo fraco) sem
 * precisar de um realce de agudos chutado por cima.
 *
 * **Ao longo da música inteira**, e não por quadro: normalizar por quadro
 * tiraria justamente a dinâmica que se quer ver — um trecho baixo ficaria
 * igual ao refrão. Isto roda uma vez, na construção da análise, e é
 * determinístico: o Remotion pode pedir os quadros na ordem que quiser.
 *
 * Recebe dB e devolve 0..1 **no lugar**, para não duplicar o array.
 */
export function normalizarParaExibicao(bandas: Float32Array, nBandas: number): void {
  const total = Math.floor(bandas.length / nBandas);
  if (total <= 0) return;

  const coluna = new Float32Array(total);
  for (let f = 0; f < nBandas; f += 1) {
    for (let q = 0; q < total; q += 1) coluna[q] = bandas[q * nBandas + f];
    // Float32Array.sort() já ordena numericamente, ao contrário de Array.
    const ordenada = coluna.slice().sort();
    const referencia = ordenada[Math.min(total - 1, Math.floor(total * PERCENTIL))];
    const piso = referencia - FAIXA_DB;

    // Duas coisas ao mesmo tempo, e é a combinação que faz o desenho ficar
    // certo: a faixa usa o PRÓPRIO alcance dinâmico (por isso reage), mas a
    // altura máxima que ela alcança vem do nível ABSOLUTO dela (por isso uma
    // faixa fraca continua parecendo fraca, em vez de virar ruído esticado).
    const teto = Math.min(1, Math.max(0, (referencia - PISO_ABSOLUTO_DB) / FAIXA_DB));

    for (let q = 0; q < total; q += 1) {
      const dentro = (bandas[q * nBandas + f] - piso) / FAIXA_DB;
      const v = teto * (dentro < 0 ? 0 : dentro > 1 ? 1 : dentro);
      bandas[q * nBandas + f] = v;
    }
  }
}

/**
 * Divide o espectro em `n` faixas LOGARÍTMICAS, de 40 Hz a 12 kHz.
 *
 * Logarítmicas, não lineares: o ouvido percebe frequência assim, e uma
 * divisão linear joga quase toda a música nas duas primeiras barras — o
 * visualizador fica com um pico na esquerda e nada no resto.
 *
 * Função pura do `sampleRate` e do tamanho da FFT: dá para testar sem áudio.
 */
export function faixasLogaritmicas(
  sampleRate: number,
  amostras: number,
  n: number,
): { de: number; ate: number }[] {
  const MIN_HZ = 40;
  // O teto é NYQUIST, não um número redondo escolhido a gosto. A análise roda
  // a 16 kHz (`useEnvelope.ts`), então o espectro acaba em 8 kHz: pedir 12 kHz
  // devolvia índice 269 num array de 256, e `espectro[269]` é `undefined` —
  // que vira NaN na conta e `transform: scaleY(NaN)` na barra, sem erro nenhum.
  const teto = (sampleRate / 2) * 0.98;
  const MAX_HZ = Math.min(12_000, teto);
  const ultimoBin = Math.max(0, amostras - 1);
  const faixas: { de: number; ate: number }[] = [];
  let anterior = MIN_HZ;

  for (let i = 0; i < n; i += 1) {
    const ate = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, (i + 1) / n);
    const idx = indicesDaBanda(sampleRate, amostras, anterior, ate);
    const de = Math.min(idx.de, ultimoBin);
    faixas.push({
      de,
      // Cada faixa precisa de pelo menos um bin: nas primeiras, a resolução da
      // FFT é mais grossa que a largura da faixa e `de` passaria de `ate`.
      ate: Math.min(Math.max(de, idx.ate), ultimoBin),
    });
    anterior = ate;
  }

  return faixas;
}
