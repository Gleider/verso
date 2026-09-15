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
  intensidade: 0.6,
  saida: true,
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
    // terminar — não pode cair na janela de saída.
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

  it("scaling começa menor — a transform não é 'none'", () => {
    expect(MODOS.scaling.verso(noComeco).transform).not.toBe("none");
  });

  it("mask começa deformado — a transform não é 'none'", () => {
    expect(MODOS.mask.verso(noComeco).transform).not.toBe("none");
  });

  it("wipe começa totalmente escondido pelo clipPath, no quadro zero", () => {
    const clip = MODOS.wipe.verso(noComeco).clipPath;
    expect(clip).not.toBeNull();
    expect(clip).toContain("100");
  });
});

/**
 * O defeito de `pitfalls.md` §12 aplicado ao texto: amplitude pequena demais é
 * indistinguível de efeito quebrado. Estes números são o piso do que se vê.
 */
describe("piso de amplitude por intensidade", () => {
  const noComeco = (intensidade: number): EntradaDeVerso => ({
    ...versoBase,
    msNoVerso: 0,
    intensidade,
  });

  it("slide desloca pelo menos 50px mesmo com intensidade zerada", () => {
    const px = Number(
      /translateX\((-?[\d.]+)px\)/.exec(MODOS.slide.verso(noComeco(0)).transform)?.[1] ?? "0",
    );
    expect(Math.abs(px)).toBeGreaterThan(50);
  });

  it("intensidade máxima desloca bem mais que a mínima", () => {
    const leia = (i: number) =>
      Math.abs(
        Number(/translateX\((-?[\d.]+)px\)/.exec(MODOS.slide.verso(noComeco(i)).transform)?.[1] ?? "0"),
      );
    expect(leia(1)).toBeGreaterThan(leia(0) * 2);
  });

  it("popup encolhe pelo menos 10% mesmo com intensidade zerada", () => {
    const escala = Number(
      /scale\(([\d.]+)\)/.exec(MODOS.popup.verso(noComeco(0)).transform)?.[1] ?? "1",
    );
    expect(escala).toBeLessThan(0.9);
  });
});

describe("animação de saída", () => {
  // Já dentro da janela final: duracaoMs 2000, entradaMs 420 -> resta 200ms.
  const saindo: EntradaDeVerso = { ...versoBase, msNoVerso: 1800 };

  it("com saida ligada, fade já está apagando", () => {
    expect(MODOS.fade.verso(saindo).opacity).toBeLessThan(0.9);
  });

  it("com saida desligada, o verso fica cheio até o fim", () => {
    expect(MODOS.fade.verso({ ...saindo, saida: false }).opacity).toBeCloseTo(1, 5);
  });

  it("wipe fecha a máscara pela esquerda ao sair", () => {
    const clip = MODOS.wipe.verso(saindo).clipPath ?? "";
    const esquerda = Number(/inset\(0 [\d.]+% 0 ([\d.]+)%\)/.exec(clip)?.[1] ?? "0");
    expect(esquerda).toBeGreaterThan(0);
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
  it("todo segmento se move — não só o que está sendo cantado", () => {
    // Um verso parado com uma sílaba pulando sozinha não lê como borbulha.
    const parado = MODOS.bubbling.segmento(segmentoDe(versoBase, 0));
    expect(parado.transform).not.toBe("none");
  });

  it("o segmento ativo se move mais que os outros", () => {
    const amplitudeDe = (indice: number) => {
      // Varre o tempo: comparar num instante só pode cair no zero do seno.
      let maior = 0;
      for (let ms = 0; ms < 2200; ms += 25) {
        const t = MODOS.bubbling.segmento({ ...segmentoDe(versoBase, indice), msAbsoluto: ms });
        const y = Math.abs(Number(/translateY\((-?[\d.]+)px\)/.exec(t.transform)?.[1] ?? "0"));
        maior = Math.max(maior, y);
      }
      return maior;
    };
    expect(amplitudeDe(2)).toBeGreaterThan(amplitudeDe(0));
  });
});
