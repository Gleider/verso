import { describe, expect, it } from "vitest";
import { fatorDoMovimento, intensidadeComMovimento, MOVIMENTOS } from "../movimento";
import { SETTINGS_PADRAO, type VideoSettings } from "../../settings";

const com = (v: Partial<VideoSettings["style"]>): VideoSettings["style"] => ({
  ...SETTINGS_PADRAO.style,
  ...v,
});

describe("fatorDoMovimento", () => {
  it("parado devolve sempre cheio — e aí nada se move", () => {
    for (const ms of [0, 500, 9999]) expect(fatorDoMovimento("none", ms, 0.5, 0.3)).toBe(1);
  });

  it("na batida segue o pulso", () => {
    expect(fatorDoMovimento("batida", 1234, 0.5, 0)).toBe(0);
    expect(fatorDoMovimento("batida", 1234, 0.5, 1)).toBe(1);
  });

  it.each(["senoide", "deriva"] as const)("%s fica entre 0 e 1", (modo) => {
    for (let ms = 0; ms < 60_000; ms += 137) {
      const f = fatorDoMovimento(modo, ms, 0.5, 0.4);
      expect(Number.isFinite(f)).toBe(true);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });

  it.each(["senoide", "deriva"] as const)("%s realmente varre a faixa", (modo) => {
    // Um movimento que só oscila 5% não é movimento nenhum — é o defeito que
    // já apareceu neste projeto com amplitude pequena demais (pitfalls §12).
    const vistos: number[] = [];
    for (let ms = 0; ms < 60_000; ms += 100) vistos.push(fatorDoMovimento(modo, ms, 0.5, 0));
    expect(Math.max(...vistos) - Math.min(...vistos)).toBeGreaterThan(0.6);
  });

  it("velocidade alta oscila mais vezes que velocidade baixa", () => {
    const cruzamentos = (vel: number) => {
      let n = 0;
      let anterior = fatorDoMovimento("senoide", 0, vel, 0);
      for (let ms = 50; ms < 30_000; ms += 50) {
        const atual = fatorDoMovimento("senoide", ms, vel, 0);
        if ((anterior - 0.5) * (atual - 0.5) < 0) n += 1;
        anterior = atual;
      }
      return n;
    };
    expect(cruzamentos(1)).toBeGreaterThan(cruzamentos(0));
  });

  it("é determinística — o Remotion pede quadro fora de ordem", () => {
    for (const modo of ["senoide", "deriva", "batida"] as const) {
      expect(fatorDoMovimento(modo, 7777, 0.6, 0.5)).toBe(fatorDoMovimento(modo, 7777, 0.6, 0.5));
    }
  });
});

describe("intensidadeComMovimento", () => {
  it("parado devolve a intensidade escolhida, intacta", () => {
    const s = com({ textureIntensity: 0.73, movimento: "none" });
    expect(intensidadeComMovimento(s, 4200, 0.5)).toBeCloseTo(0.73, 6);
  });

  it("profundidade zero também não mexe", () => {
    const s = com({ textureIntensity: 0.73, movimento: "senoide", movimentoProfundidade: 0 });
    expect(intensidadeComMovimento(s, 4200, 0.5)).toBeCloseTo(0.73, 6);
  });

  it("nunca passa do valor escolhido no painel", () => {
    // O movimento TIRA, não acrescenta: o ajuste do usuário é o teto do que
    // ele vai ver, senão o controle de intensidade deixa de significar algo.
    const s = com({ textureIntensity: 0.4, movimento: "deriva", movimentoProfundidade: 1 });
    for (let ms = 0; ms < 40_000; ms += 91) {
      const v = intensidadeComMovimento(s, ms, 0.8);
      expect(v).toBeLessThanOrEqual(0.4 + 1e-9);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it("profundidade cheia chega perto de apagar o efeito", () => {
    const s = com({ textureIntensity: 0.9, movimento: "senoide", movimentoProfundidade: 1 });
    const vistos: number[] = [];
    for (let ms = 0; ms < 30_000; ms += 50) vistos.push(intensidadeComMovimento(s, ms, 0));
    expect(Math.min(...vistos)).toBeLessThan(0.05);
    expect(Math.max(...vistos)).toBeGreaterThan(0.85);
  });

  it("o catálogo do painel cobre todos os modos, sem repetir", () => {
    const ids = MOVIMENTOS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("none");
  });
});
