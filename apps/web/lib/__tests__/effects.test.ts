/**
 * Efeitos da imagem de fundo.
 *
 * Cada efeito é uma função pura do tempo e da batida: o componente só aplica o
 * que ela devolve. Isso mantém o custo por quadro em escrita de estilo, e torna
 * o comportamento testável sem navegador.
 */
import { describe, expect, it } from "vitest";
import { EFFECTS, DEFAULT_EFFECT, effectFrame, isEffectId } from "../effects";

describe("catálogo", () => {
  it("expõe os efeitos com identificador e rótulo", () => {
    expect(EFFECTS.length).toBeGreaterThanOrEqual(4);
    for (const effect of EFFECTS) {
      expect(effect.id).toMatch(/^[a-z-]+$/);
      expect(effect.label.length).toBeGreaterThan(0);
      expect(effect.description.length).toBeGreaterThan(0);
    }
  });

  it("não repete identificadores", () => {
    const ids = EFFECTS.map((effect) => effect.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reconhece identificadores válidos e recusa lixo", () => {
    expect(isEffectId(DEFAULT_EFFECT)).toBe(true);
    expect(isEffectId("vhs")).toBe(true);
    expect(isEffectId("qualquer-coisa")).toBe(false);
  });
});

describe("efeito 'nenhum'", () => {
  it("deixa a imagem parada e sem alteração de cor", () => {
    const frame = effectFrame("none", 12_345, 1);

    expect(frame.filter).toBe("none");
    expect(frame.scanlines).toBe(0);
    expect(frame.noise).toBe(0);
    expect(frame.chroma).toBeNull();
  });

  it("ignora a batida", () => {
    expect(effectFrame("none", 0, 0)).toEqual(effectFrame("none", 0, 1));
  });
});

describe("efeito 'respiração'", () => {
  it("move a imagem ao longo do tempo", () => {
    expect(effectFrame("breathe", 0, 0).transform).not.toBe(
      effectFrame("breathe", 9000, 0).transform,
    );
  });

  it("não usa recursos de vídeo analógico", () => {
    const frame = effectFrame("breathe", 5000, 0.5);
    expect(frame.scanlines).toBe(0);
    expect(frame.chroma).toBeNull();
  });

  it("responde à batida", () => {
    expect(effectFrame("breathe", 1000, 1).filter).not.toBe(
      effectFrame("breathe", 1000, 0).filter,
    );
  });
});

describe("efeito VHS", () => {
  it("liga as marcas do formato: linhas, ruído e separação de cor", () => {
    const frame = effectFrame("vhs", 4000, 0);

    expect(frame.scanlines).toBeGreaterThan(0);
    expect(frame.noise).toBeGreaterThan(0);
    expect(frame.chroma).not.toBeNull();
  });

  it("lava a cor, como fita gasta faz", () => {
    expect(effectFrame("vhs", 4000, 0).filter).toMatch(/saturate|contrast/);
  });

  it("treme, mas dentro de um limite que não atrapalha a leitura", () => {
    // Mesmo no máximo o tremor tem teto: acima disso a letra fica ilegível.
    for (let t = 0; t < 20_000; t += 37) {
      const { jitterY } = effectFrame("vhs", t, 0);
      expect(Math.abs(jitterY)).toBeLessThanOrEqual(1.5);
    }
  });

  it("o tremor muda ao longo do tempo em vez de ficar fixo", () => {
    const amostras = new Set(
      Array.from({ length: 60 }, (_, i) => effectFrame("vhs", i * 90, 0).jitterY.toFixed(3)),
    );
    expect(amostras.size).toBeGreaterThan(8);
  });

  it("a falha de rastreamento é ocasional, não constante", () => {
    const comFalha = Array.from(
      { length: 600 },
      (_, i) => effectFrame("vhs", i * 100, 0).tracking !== null,
    ).filter(Boolean).length;

    expect(comFalha).toBeGreaterThan(0);
    expect(comFalha).toBeLessThan(200); // aparece, mas não domina
  });

  it("a faixa da falha fica dentro do quadro", () => {
    for (let t = 0; t < 60_000; t += 53) {
      const { tracking } = effectFrame("vhs", t, 0);
      if (!tracking) continue;
      expect(tracking.y).toBeGreaterThanOrEqual(0);
      expect(tracking.y + tracking.height).toBeLessThanOrEqual(100);
    }
  });
});

describe("efeito 'pulso'", () => {
  it("reage à batida sem vagar pela tela", () => {
    const parado = effectFrame("pulse", 7000, 0);
    const batendo = effectFrame("pulse", 7000, 1);

    expect(parado.transform).not.toBe(batendo.transform);
    // Sem batida, fica no lugar: o movimento vem da música, não do relógio.
    expect(effectFrame("pulse", 0, 0).transform).toBe(parado.transform);
  });
});

describe("invariantes de todos os efeitos", () => {
  it("sempre devolvem transform e filter aplicáveis", () => {
    for (const effect of EFFECTS) {
      for (const pulse of [0, 0.5, 1]) {
        const frame = effectFrame(effect.id, 3210, pulse);
        expect(typeof frame.transform).toBe("string");
        expect(frame.transform.length).toBeGreaterThan(0);
        expect(typeof frame.filter).toBe("string");
        expect(frame.noise).toBeGreaterThanOrEqual(0);
        expect(frame.noise).toBeLessThanOrEqual(1);
        expect(frame.scanlines).toBeGreaterThanOrEqual(0);
        expect(frame.scanlines).toBeLessThanOrEqual(1);
      }
    }
  });

  it("identificador desconhecido cai no efeito padrão em vez de quebrar", () => {
    expect(effectFrame("inexistente", 1000, 0)).toEqual(
      effectFrame(DEFAULT_EFFECT, 1000, 0),
    );
  });
});

describe("intensidade", () => {
  const forte = () => effectFrame("vhs", 4000, 0, 1);
  const fraco = () => effectFrame("vhs", 4000, 0, 0.05);

  it("no máximo, o VHS é muito mais presente que no mínimo", () => {
    expect(forte().scanlines).toBeGreaterThan(fraco().scanlines * 2);
    expect(forte().noise).toBeGreaterThan(fraco().noise * 2);
    expect(forte().chroma!.opacity).toBeGreaterThan(fraco().chroma!.opacity * 2);
  });

  it("o tremor cresce com a intensidade", () => {
    const amplitude = (intensity: number) =>
      Math.max(
        ...Array.from({ length: 120 }, (_, i) =>
          Math.abs(effectFrame("vhs", i * 71, 0, intensity).jitterY),
        ),
      );

    expect(amplitude(1)).toBeGreaterThan(amplitude(0.2) * 2);
  });

  it("a falha de rastreamento fica mais frequente no máximo", () => {
    const contar = (intensity: number) =>
      Array.from(
        { length: 600 },
        (_, i) => effectFrame("vhs", i * 100, 0, intensity).tracking !== null,
      ).filter(Boolean).length;

    expect(contar(1)).toBeGreaterThan(contar(0.2));
  });

  it("no mínimo o efeito quase desaparece, sem sumir de vez", () => {
    const quase = effectFrame("vhs", 4000, 0, 0.02);
    expect(quase.scanlines).toBeGreaterThan(0);
    expect(quase.scanlines).toBeLessThan(0.1);
  });

  it("vale para os outros efeitos, não só o VHS", () => {
    const desvio = (intensity: number) => {
      const frame = effectFrame("breathe", 9000, 1, intensity);
      const escala = Number(frame.transform.match(/scale\(([\d.]+)\)/)![1]);
      return Math.abs(escala - 1);
    };

    expect(desvio(1)).toBeGreaterThan(desvio(0.2));
  });

  it("intensidade ausente equivale ao máximo", () => {
    expect(effectFrame("vhs", 4000, 0)).toEqual(effectFrame("vhs", 4000, 0, 1));
  });

  it("valores fora da faixa são contidos em vez de estourar", () => {
    expect(effectFrame("vhs", 4000, 0, 5)).toEqual(effectFrame("vhs", 4000, 0, 1));
    expect(effectFrame("vhs", 4000, 0, -3)).toEqual(effectFrame("vhs", 4000, 0, 0));
  });

  it("segue dentro dos limites de segurança em qualquer intensidade", () => {
    for (const intensity of [0, 0.25, 0.5, 0.75, 1]) {
      for (let t = 0; t < 20_000; t += 211) {
        const frame = effectFrame("vhs", t, 0.5, intensity);
        expect(frame.noise).toBeLessThanOrEqual(1);
        expect(frame.scanlines).toBeLessThanOrEqual(1);
        if (frame.tracking) {
          expect(frame.tracking.y + frame.tracking.height).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});
