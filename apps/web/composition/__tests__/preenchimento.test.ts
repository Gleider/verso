import { describe, expect, it } from "vitest";
import { posicaoNoVerso } from "../preenchimento";
import type { SegmentoPreparado } from "../versos";

const segmentos: SegmentoPreparado[] = [
  { texto: "ca", s: 0, e: 100 },
  { texto: "cho", s: 100, e: 300 },
  { texto: "rro", s: 300, e: 500 },
];

describe("posicaoNoVerso", () => {
  it("é -1 antes do verso começar", () => {
    expect(posicaoNoVerso(segmentos, -10).indiceAtual).toBe(-1);
  });

  it("acha o segmento certo e a fração decorrida nele", () => {
    // t=200 está dentro do segmento 1 ("cho", 100-300), 50% decorrido.
    const posicao = posicaoNoVerso(segmentos, 200);
    expect(posicao.indiceAtual).toBe(1);
    expect(posicao.preenchimento).toBeCloseTo(0.5, 5);
  });

  it("no início exato de um segmento, o preenchimento é 0", () => {
    expect(posicaoNoVerso(segmentos, 100).preenchimento).toBeCloseTo(0, 5);
  });

  it("depois do fim do último segmento, indiceAtual passa do último índice real", () => {
    const posicao = posicaoNoVerso(segmentos, 1000);
    expect(posicao.indiceAtual).toBe(segmentos.length);
  });

  it("o índice nunca diminui conforme o tempo avança — o karaokê não anda para trás", () => {
    let anterior = -1;
    for (let ms = 0; ms <= 500; ms += 17) {
      const atual = posicaoNoVerso(segmentos, ms).indiceAtual;
      expect(atual).toBeGreaterThanOrEqual(anterior);
      anterior = atual;
    }
  });

  it("não quebra com lista vazia de segmentos", () => {
    expect(posicaoNoVerso([], 100)).toEqual({ indiceAtual: -1, preenchimento: 0 });
  });
});
