import { describe, expect, it } from "vitest";
import { indicesDaBanda, magnitudeParaEscalaDeAnalisador , magnitudeEmDb, normalizarParaExibicao } from "../bandas";

describe("indicesDaBanda", () => {
  it("acha os bins que cobrem a faixa de frequência pedida", () => {
    // sampleRate=16000, amostras=256 -> largura de bin = 31.25Hz.
    const { de, ate } = indicesDaBanda(16_000, 256, 40, 330);
    expect(de).toBe(2); // ceil(40/31.25)
    expect(ate).toBe(10); // floor(330/31.25)
  });

  it("nunca inclui o bin 0 — é a componente DC, não frequência", () => {
    const { de } = indicesDaBanda(16_000, 256, 0, 100);
    expect(de).toBeGreaterThanOrEqual(1);
  });

  it("nunca passa do último bin válido", () => {
    const { ate } = indicesDaBanda(16_000, 256, 40, 100_000);
    expect(ate).toBeLessThanOrEqual(255);
  });
});

describe("magnitudeParaEscalaDeAnalisador", () => {
  it("magnitude zero (ou negativa) vira o piso da escala, não NaN", () => {
    expect(magnitudeParaEscalaDeAnalisador(0)).toBeCloseTo(0, 5);
  });

  it("nunca sai de 0..1, mesmo com magnitude maior que 1", () => {
    expect(magnitudeParaEscalaDeAnalisador(10)).toBeLessThanOrEqual(1);
    expect(magnitudeParaEscalaDeAnalisador(10)).toBeGreaterThanOrEqual(0);
  });

  it("é crescente — mais magnitude nunca vira menos energia", () => {
    const baixa = magnitudeParaEscalaDeAnalisador(0.001);
    const alta = magnitudeParaEscalaDeAnalisador(0.5);
    expect(alta).toBeGreaterThan(baixa);
  });
});

describe("normalizarParaExibicao", () => {
  const N = 4;

  /** `quadros` linhas de N faixas, em dB, achatado como a análise guarda. */
  function montar(linhas: number[][]): Float32Array {
    const f = new Float32Array(linhas.length * N);
    linhas.forEach((linha, q) => linha.forEach((v, i) => (f[q * N + i] = v)));
    return f;
  }

  it("espalha a faixa que varia por todo o 0..1", () => {
    // Uma faixa que vai de -70 a -20 dB tem que usar o alcance inteiro, não
    // ficar grudada no teto — que era o defeito.
    const quadros = 50;
    const linhas = Array.from({ length: quadros }, (_, q) => {
      const db = -70 + (q / (quadros - 1)) * 50;
      return [db, db, db, db];
    });
    const b = montar(linhas);
    normalizarParaExibicao(b, N);
    expect(b[0]).toBeLessThan(0.1);
    expect(b[(quadros - 1) * N]).toBeGreaterThan(0.9);
  });

  it("não deixa quase tudo saturado em 1", () => {
    // O sintoma relatado: o visualizador parece reagir a poucas frequências
    // porque a maioria das faixas vive no teto.
    const quadros = 60;
    const linhas = Array.from({ length: quadros }, (_, q) =>
      Array.from({ length: N }, (_, i) => -55 + Math.sin(q * 0.4 + i) * 12),
    );
    const b = montar(linhas);
    normalizarParaExibicao(b, N);
    const saturadas = Array.from(b).filter((v) => v >= 0.999).length;
    expect(saturadas / b.length).toBeLessThan(0.15);
  });

  it("faixa praticamente muda continua baixa, em vez de virar ruído esticado", () => {
    // Sem o piso de referência, a normalização por faixa pegaria o chiado e o
    // esticaria até o topo.
    const quadros = 40;
    const linhas = Array.from({ length: quadros }, (_, q) => [
      -20, // faixa com sinal de verdade
      -88 + (q % 3), // faixa muda
      -20,
      -20,
    ]);
    const b = montar(linhas);
    normalizarParaExibicao(b, N);
    for (let q = 0; q < quadros; q += 1) expect(b[q * N + 1]).toBeLessThan(0.25);
  });

  it("é determinística — o Remotion pede quadro fora de ordem", () => {
    const linhas = Array.from({ length: 30 }, (_, q) =>
      Array.from({ length: N }, (_, i) => -60 + ((q * 7 + i * 13) % 40)),
    );
    const a = montar(linhas);
    const c = montar(linhas);
    normalizarParaExibicao(a, N);
    normalizarParaExibicao(c, N);
    expect(Array.from(a)).toEqual(Array.from(c));
  });

  it("análise vazia não estoura", () => {
    const vazio = new Float32Array(0);
    expect(() => normalizarParaExibicao(vazio, N)).not.toThrow();
  });

  it("magnitudeEmDb tem piso e não devolve -Infinity", () => {
    expect(Number.isFinite(magnitudeEmDb(0))).toBe(true);
    expect(magnitudeEmDb(1)).toBeCloseTo(0, 5);
  });
});
