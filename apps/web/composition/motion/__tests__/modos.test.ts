import { describe, expect, it } from "vitest";
import { MODOS } from "../index";
import type { EntradaDeSegmento, EntradaDeVerso } from "../tipos";

const versoBase: EntradaDeVerso = {
  msNoVerso: 200,
  duracaoMs: 2000,
  entradaMs: 420,
  msAbsoluto: 50_200,
  pulso: 0.3,
  tweak: "none",
  indiceDoVerso: 4,
};

function segmentoDe(entrada: EntradaDeVerso, indice: number): EntradaDeSegmento {
  return { ...entrada, indice, total: 5, indiceAtual: 2, preenchimento: 0.5 };
}

describe.each(Object.values(MODOS))("modo $id", (modo) => {
  it("verso() é determinístico — mesma entrada, mesma saída", () => {
    expect(modo.verso(versoBase)).toEqual(modo.verso(versoBase));
  });

  it("segmento() é determinístico — mesma entrada, mesma saída", () => {
    const entrada = segmentoDe(versoBase, 2);
    expect(modo.segmento(entrada)).toEqual(modo.segmento(entrada));
  });

  it("nunca produz opacity fora de 0..1", () => {
    const { opacity } = modo.verso(versoBase);
    expect(opacity).toBeGreaterThanOrEqual(0);
    expect(opacity).toBeLessThanOrEqual(1);
  });

  it("o segmento já cantado (antes do atual) sempre preenche por completo", () => {
    const entrada = segmentoDe(versoBase, 0); // índice 0, indiceAtual 2 -> já passou
    expect(modo.segmento(entrada).preenchimento).toBe(1);
  });

  it("o segmento futuro (depois do atual) nunca preenche", () => {
    const entrada = segmentoDe(versoBase, 4); // índice 4, indiceAtual 2 -> ainda não chegou
    expect(modo.segmento(entrada).preenchimento).toBe(0);
  });

  it("depois de entradaMs (mas antes do fim do verso), o estado se estabiliza em opacity 1", () => {
    // 1000ms: bem depois de entradaMs (420) e bem antes de duracaoMs (2000)
    // terminar — não pode cair na janela de saída do `fade`.
    const noMeio: EntradaDeVerso = { ...versoBase, msNoVerso: 1000 };
    expect(modo.verso(noMeio).opacity).toBeCloseTo(1, 5);
  });
});

describe("entrada com amplitude visível", () => {
  const noComeco: EntradaDeVerso = { ...versoBase, msNoVerso: 0 };

  it("fade começa com opacidade baixa, não já em 1", () => {
    expect(MODOS.fade.verso(noComeco).opacity).toBeLessThan(0.3);
  });

  it("slide começa deslocado — a transform não é 'none'", () => {
    expect(MODOS.slide.verso(noComeco).transform).not.toBe("none");
  });

  it("popup começa menor — a transform não é 'none'", () => {
    expect(MODOS.popup.verso(noComeco).transform).not.toBe("none");
  });

  it("wipe começa totalmente escondido pelo clipPath, no quadro zero", () => {
    const clip = MODOS.wipe.verso(noComeco).clipPath;
    expect(clip).not.toBeNull();
    expect(clip).toContain("100");
  });
});

describe("mask", () => {
  it("marca recorta=true — é o único modo que faz isso", () => {
    expect(MODOS.mask.verso(versoBase).recorta).toBe(true);
    for (const [id, modo] of Object.entries(MODOS)) {
      if (id === "mask") continue;
      expect(modo.verso(versoBase).recorta).toBe(false);
    }
  });
});

describe("bubbling", () => {
  it("só o segmento ativo se move — os outros ficam parados", () => {
    const ativo = segmentoDe(versoBase, 2); // indiceAtual = 2
    const parado = segmentoDe(versoBase, 0);
    expect(MODOS.bubbling.segmento(parado).transform).toBe("none");
    // O ativo pode calhar de estar no cruzamento do seno (transform "none"
    // também), então o teste real é: em pontos diferentes do tempo, ao menos
    // um produz movimento.
    const emOutroInstante = MODOS.bubbling.segmento({ ...ativo, msNoVerso: 450 });
    const algumMovimento =
      MODOS.bubbling.segmento(ativo).transform !== "none" || emOutroInstante.transform !== "none";
    expect(algumMovimento).toBe(true);
  });
});
