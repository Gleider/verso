import { describe, expect, it } from "vitest";
import { grao } from "../grain";

describe("grao", () => {
  it("é determinístico — mesmo instante, mesmo estado, sempre", () => {
    expect(grao(1234, 0.5, 0)).toEqual(grao(1234, 0.5, 0));
  });

  it("tem piso de opacidade visível mesmo em intensidade zero", () => {
    // O defeito real registrado em pitfalls.md §12: amplitude pequena demais
    // é indistinguível de efeito quebrado. Quem escolheu a textura quer vê-la.
    expect(grao(0, 0, 0).granulado).toBeGreaterThan(0.02);
  });

  it("a opacidade cresce com a intensidade", () => {
    const baixa = grao(0, 0.1, 0).granulado;
    const alta = grao(0, 0.9, 0).granulado;
    expect(alta).toBeGreaterThan(baixa);
  });

  it("nunca passa de 1 de opacidade, mesmo com intensidade fora da faixa", () => {
    expect(grao(0, 5, 0).granulado).toBeLessThanOrEqual(1);
  });

  it("o deslocamento muda entre blocos de tempo — é o que dá o chiado", () => {
    const a = grao(0, 0.8, 0).deslocamento;
    const b = grao(500, 0.8, 0).deslocamento;
    expect(a).not.toEqual(b);
  });

  it("não altera cor — grão é textura, não filtro", () => {
    expect(grao(0, 0.8, 0).filter).toBe("none");
  });
});
