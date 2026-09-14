import { describe, expect, it } from "vitest";
import { msDoQuadro, quadroDoMs, totalDeQuadros } from "../tempo";

describe("msDoQuadro", () => {
  it("converte o quadro para o instante em ms, a 30 fps", () => {
    expect(msDoQuadro(30, 30)).toBe(1000);
    expect(msDoQuadro(15, 30)).toBe(500);
  });

  it("o quadro zero é o instante zero", () => {
    expect(msDoQuadro(0, 30)).toBe(0);
  });
});

describe("quadroDoMs", () => {
  it("é o inverso de msDoQuadro para múltiplos exatos do passo de quadro", () => {
    expect(quadroDoMs(1000, 30)).toBe(30);
  });

  it("arredonda para baixo dentro do quadro", () => {
    // 999ms a 30fps ainda está dentro do quadro 29 (966,6ms a 999,9ms).
    expect(quadroDoMs(999, 30)).toBe(29);
  });
});

describe("totalDeQuadros", () => {
  it("cobre a duração inteira, arredondando para cima", () => {
    // 209076ms a 30fps não é múltiplo exato; precisa do quadro parcial final.
    expect(totalDeQuadros(209_076, 30)).toBe(6273);
  });

  it("nunca devolve zero — duração zero ainda precisa de um quadro", () => {
    expect(totalDeQuadros(0, 30)).toBe(1);
  });

  it("não quebra com duração negativa", () => {
    expect(totalDeQuadros(-100, 30)).toBe(1);
  });
});
