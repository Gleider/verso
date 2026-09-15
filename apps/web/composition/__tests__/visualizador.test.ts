import { describe, expect, it } from "vitest";
import { bandasDoQuadro, formaDoVisualizador } from "../visualizador";
import { N_BANDAS } from "../audio/envelope";
import { faixasLogaritmicas } from "../audio/bandas";
import { modoDaParticula } from "../gl/particulas";
import { SETTINGS_PADRAO, type VideoSettings } from "../settings";
import type { AnaliseDeAudio } from "../audio/envelope";

const TAXA = 16_000;
const AMOSTRAS = 256;

/** Análise sintética: rampa crescente por faixa, constante no tempo. */
function analiseFalsa(quadros: number): AnaliseDeAudio {
  const bandas = new Float32Array(quadros * N_BANDAS);
  for (let q = 0; q < quadros; q += 1) {
    for (let f = 0; f < N_BANDAS; f += 1) bandas[q * N_BANDAS + f] = f / (N_BANDAS - 1);
  }
  return { pulso: new Float32Array(quadros).fill(0.5), bandas };
}

const com = (v: Partial<VideoSettings["visualizer"]>): VideoSettings => ({
  ...SETTINGS_PADRAO,
  visualizer: { ...SETTINGS_PADRAO.visualizer, ...v },
});

describe("faixasLogaritmicas", () => {
  it("devolve exatamente o número de faixas pedido", () => {
    expect(faixasLogaritmicas(TAXA, AMOSTRAS, N_BANDAS)).toHaveLength(N_BANDAS);
  });

  it("nenhuma faixa fica vazia", () => {
    // Nas primeiras faixas a resolução da FFT é mais grossa que a largura da
    // faixa; sem a proteção, `de` passaria de `ate` e a barra ficaria morta.
    for (const f of faixasLogaritmicas(TAXA, AMOSTRAS, N_BANDAS)) {
      expect(f.ate).toBeGreaterThanOrEqual(f.de);
    }
  });

  it("as faixas sobem em frequência", () => {
    const f = faixasLogaritmicas(TAXA, AMOSTRAS, N_BANDAS);
    for (let i = 1; i < f.length; i += 1) {
      expect(f[i].de).toBeGreaterThanOrEqual(f[i - 1].de);
    }
  });

  it("os índices cabem na FFT", () => {
    for (const f of faixasLogaritmicas(TAXA, AMOSTRAS, N_BANDAS)) {
      expect(f.de).toBeGreaterThanOrEqual(0);
      expect(f.ate).toBeLessThan(AMOSTRAS);
    }
  });
});

describe("bandasDoQuadro", () => {
  it("sem análise, devolve vazio", () => {
    expect(bandasDoQuadro(null, 0)).toEqual([]);
  });

  it("lê o quadro certo", () => {
    expect(bandasDoQuadro(analiseFalsa(10), 3)).toHaveLength(N_BANDAS);
  });

  it("quadro fora do intervalo não estoura — prende no último", () => {
    // O `<Player>` pode pedir um quadro além do fim enquanto o áudio ainda
    // está decodificando; ali um `undefined` viraria NaN no `transform`.
    const a = analiseFalsa(5);
    expect(bandasDoQuadro(a, 999)).toHaveLength(N_BANDAS);
    expect(bandasDoQuadro(a, -3)).toHaveLength(N_BANDAS);
    for (const v of bandasDoQuadro(a, 999)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("formaDoVisualizador", () => {
  const analise = analiseFalsa(20);

  it("devolve null quando desligado — e aí o Karaoke nem monta a camada", () => {
    expect(formaDoVisualizador(com({ tipo: "none" }), analise, 0, 0)).toBeNull();
  });

  it("é determinística", () => {
    const a = formaDoVisualizador(com({ tipo: "barras" }), analise, 4, 0.3);
    const b = formaDoVisualizador(com({ tipo: "barras" }), analise, 4, 0.3);
    expect(a).toEqual(b);
  });

  it.each(["barras", "onda", "circular", "anel"] as const)("%s devolve a forma certa", (tipo) => {
    const f = formaDoVisualizador(com({ tipo }), analise, 4, 0.3);
    expect(f?.tipo).toBe(tipo);
  });

  it("barras e circular têm uma entrada por faixa", () => {
    const b = formaDoVisualizador(com({ tipo: "barras" }), analise, 4, 0);
    const c = formaDoVisualizador(com({ tipo: "circular" }), analise, 4, 0);
    expect(b?.tipo === "barras" && b.alturas).toHaveLength(N_BANDAS);
    expect(c?.tipo === "circular" && c.raios).toHaveLength(N_BANDAS);
  });

  it("a onda é simétrica em torno do centro", () => {
    // É o que dá a silhueta de osciloscópio; sem espelhar vira uma rampa.
    const f = formaDoVisualizador(com({ tipo: "onda" }), analise, 4, 0);
    if (f?.tipo !== "onda") throw new Error("forma errada");
    const n = f.pontos.length;
    expect(f.pontos[0].y).toBeCloseTo(f.pontos[n - 1].y, 5);
  });

  it("nenhum valor sai de 0..1 — um NaN ali vira transform inválido", () => {
    for (const tipo of ["barras", "circular"] as const) {
      const f = formaDoVisualizador(com({ tipo, intensidade: 1 }), analise, 4, 1);
      const vs = f?.tipo === "barras" ? f.alturas : f?.tipo === "circular" ? f.raios : [];
      for (const v of vs) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("intensidade zero achata, intensidade cheia levanta", () => {
    const baixo = formaDoVisualizador(com({ tipo: "barras", intensidade: 0 }), analise, 4, 0);
    const alto = formaDoVisualizador(com({ tipo: "barras", intensidade: 1 }), analise, 4, 0);
    const soma = (f: ReturnType<typeof formaDoVisualizador>) =>
      f?.tipo === "barras" ? f.alturas.reduce((a, b) => a + b, 0) : 0;
    expect(soma(alto)).toBeGreaterThan(soma(baixo));
  });

  it("sem áudio decodificado ainda desenha algo, em repouso", () => {
    // O editor abre antes de o áudio ficar pronto; um visualizador sumido ali
    // pareceria defeito.
    const f = formaDoVisualizador(com({ tipo: "barras" }), null, 0, 0);
    if (f?.tipo !== "barras") throw new Error("forma errada");
    expect(f.alturas).toHaveLength(N_BANDAS);
    expect(Math.max(...f.alturas)).toBeGreaterThan(0);
    expect(Math.max(...f.alturas)).toBeLessThan(0.2);
  });

  it("o anel cresce com a batida", () => {
    const parado = formaDoVisualizador(com({ tipo: "anel" }), analise, 0, 0);
    const batendo = formaDoVisualizador(com({ tipo: "anel" }), analise, 0, 1);
    if (parado?.tipo !== "anel" || batendo?.tipo !== "anel") throw new Error("forma errada");
    expect(batendo.escala).toBeGreaterThan(parado.escala);
  });
});

describe("modoDaParticula", () => {
  it("cada tipo tem um modo próprio no shader", () => {
    const modos = (["poeira", "neve", "fagulhas", "estrelas", "vagalumes"] as const).map(
      modoDaParticula,
    );
    expect(new Set(modos).size).toBe(modos.length);
  });
});
