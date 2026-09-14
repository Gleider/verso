import { describe, expect, it } from "vitest";
import { TEXTURAS } from "../index";

describe.each(Object.entries(TEXTURAS))("textura %s", (_id, textura) => {
  it("é determinística — mesmo instante, mesma saída", () => {
    expect(textura(1234, 0.5, 0.2)).toEqual(textura(1234, 0.5, 0.2));
  });

  it("todas as opacidades ficam entre 0 e 1", () => {
    const estado = textura(500, 0.8, 0.3);
    for (const campo of [estado.granulado, estado.varredura, estado.reticula, estado.vinheta]) {
      expect(campo).toBeGreaterThanOrEqual(0);
      expect(campo).toBeLessThanOrEqual(1);
    }
  });

  it("não quebra com intensidade fora da faixa 0..1", () => {
    expect(() => textura(0, 5, 0)).not.toThrow();
    expect(() => textura(0, -5, 0)).not.toThrow();
  });
});

describe("pisos de amplitude visível (pitfalls.md §12)", () => {
  it("vignette escurece as bordas mesmo em intensidade zero", () => {
    expect(TEXTURAS.vignette(0, 0, 0).vinheta).toBeGreaterThan(0.1);
  });

  it("sepia muda o filtro mesmo em intensidade zero", () => {
    expect(TEXTURAS.sepia(0, 0, 0).filter).not.toBe("none");
  });

  it("halftone tem retícula visível mesmo em intensidade zero", () => {
    expect(TEXTURAS.halftone(0, 0, 0).reticula).toBeGreaterThan(0.05);
  });

  it("dust e paper têm grão visível mesmo em intensidade zero", () => {
    expect(TEXTURAS.dust(0, 0, 0).granulado).toBeGreaterThan(0.02);
    expect(TEXTURAS.paper(0, 0, 0).granulado).toBeGreaterThan(0.02);
  });
});

describe("vhs", () => {
  it("reage ao pulso — mais pulso, filtro mais intenso", () => {
    const semPulso = TEXTURAS.vhs(0, 0.5, 0).filter;
    const comPulso = TEXTURAS.vhs(0, 0.5, 1).filter;
    expect(comPulso).not.toBe(semPulso);
  });

  it("nunca sai com uma textura vazia — sempre tem alguma sobreposição", () => {
    const estado = TEXTURAS.vhs(100, 0.5, 0);
    const algumaCoisa =
      estado.granulado > 0 || estado.varredura > 0 || estado.croma !== null;
    expect(algumaCoisa).toBe(true);
  });
});

describe("dust", () => {
  it("o risco (faixa) aparece só às vezes, não sempre", () => {
    let comRisco = 0;
    let semRisco = 0;
    for (let ms = 0; ms < 20_000; ms += 700) {
      if (TEXTURAS.dust(ms, 0.6, 0).faixa) comRisco += 1;
      else semRisco += 1;
    }
    expect(comRisco).toBeGreaterThan(0);
    expect(semRisco).toBeGreaterThan(0);
  });
});
