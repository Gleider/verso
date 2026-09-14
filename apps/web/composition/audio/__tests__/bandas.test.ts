import { describe, expect, it } from "vitest";
import { indicesDaBanda, magnitudeParaEscalaDeAnalisador } from "../bandas";

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
