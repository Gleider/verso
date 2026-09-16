import { describe, expect, it } from "vitest";
import { janelaDeQuadros, msDoQuadro, quadroDoMs, recorteValido, totalDeQuadros } from "../tempo";

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

describe("janelaDeQuadros", () => {
  const duracao = 200_000; // 3 min 20 s

  it("sem recorte, o vídeo é inteiro", () => {
    expect(janelaDeQuadros(null, duracao, 30)).toBeNull();
  });

  it("traduz o trecho em quadros, com o fim exclusivo", () => {
    // 10 s a 20 s, a 30 fps: quadros 300 a 599 — o quadro 600 já é o segundo 20.
    expect(janelaDeQuadros({ inicioMs: 10_000, fimMs: 20_000 }, duracao, 30)).toEqual([300, 599]);
  });

  it("não deixa o fim passar do último quadro da faixa", () => {
    const [, fim] = janelaDeQuadros({ inicioMs: 0, fimMs: 999_000 }, duracao, 30) ?? [0, 0];

    expect(fim).toBe(totalDeQuadros(duracao, 30) - 1);
  });

  it("um trecho curto demais ainda rende um quadro", () => {
    // Um render de zero quadro não é um vídeo curto: é um arquivo quebrado.
    expect(janelaDeQuadros({ inicioMs: 5_000, fimMs: 5_001 }, duracao, 30)).toEqual([150, 150]);
  });

  it("recorte que começa depois do fim da faixa vira o último quadro", () => {
    const ultimo = totalDeQuadros(duracao, 30) - 1;

    expect(janelaDeQuadros({ inicioMs: 900_000, fimMs: 950_000 }, duracao, 30)).toEqual([
      ultimo,
      ultimo,
    ]);
  });
});

describe("recorteValido", () => {
  it("aceita um trecho com começo antes do fim", () => {
    expect(recorteValido({ inicioMs: 1_000, fimMs: 2_000 })).toBe(true);
  });

  it("recusa fim antes do começo, e recusa trecho de duração zero", () => {
    expect(recorteValido({ inicioMs: 2_000, fimMs: 1_000 })).toBe(false);
    expect(recorteValido({ inicioMs: 2_000, fimMs: 2_000 })).toBe(false);
  });

  it("recusa um ramo pela metade, que viraria NaN sem ninguém notar", () => {
    // pitfalls.md §33: NaN não desenha nada, e some sem erro.
    expect(recorteValido({ inicioMs: 0, fimMs: Number.NaN })).toBe(false);
    expect(recorteValido(null)).toBe(false);
  });
});
