import { describe, expect, it } from "vitest";
import { DESIGN, dimensoesDaSaida, escalaDeDesign } from "../formato";
import { SETTINGS_PADRAO } from "../settings";
import type { AspectRatio, Resolucao, VideoSettings } from "../settings";

function comFormato(aspectRatio: AspectRatio, resolution: Resolucao): VideoSettings {
  return {
    ...SETTINGS_PADRAO,
    output: { ...SETTINGS_PADRAO.output, aspectRatio, resolution },
  };
}

describe("dimensoesDaSaida", () => {
  it("1080p em 16:9 é o próprio espaço de design", () => {
    const { width, height } = dimensoesDaSaida(comFormato("16:9", "1080p"));
    expect(width).toBe(1920);
    expect(height).toBe(1080);
  });

  it("1080p em 9:16 também é o próprio espaço de design", () => {
    const { width, height } = dimensoesDaSaida(comFormato("9:16", "1080p"));
    expect(width).toBe(1080);
    expect(height).toBe(1920);
  });

  it("720p reduz o lado curto para 720, mantendo a proporção", () => {
    const paisagem = dimensoesDaSaida(comFormato("16:9", "720p"));
    expect(paisagem.height).toBe(720);
    expect(paisagem.width).toBe(1280);

    const retrato = dimensoesDaSaida(comFormato("9:16", "720p"));
    expect(retrato.width).toBe(720);
    expect(retrato.height).toBe(1280);
  });

  it("as dimensões são sempre pares — o H.264 exige isso", () => {
    for (const aspectRatio of Object.keys(DESIGN) as AspectRatio[]) {
      for (const resolution of ["720p", "1080p"] as Resolucao[]) {
        const { width, height } = dimensoesDaSaida(comFormato(aspectRatio, resolution));
        expect(width % 2).toBe(0);
        expect(height % 2).toBe(0);
      }
    }
  });
});

describe("escalaDeDesign", () => {
  it("é 1 em 1080p, nas duas proporções", () => {
    expect(escalaDeDesign(comFormato("16:9", "1080p"))).toBeCloseTo(1, 5);
    expect(escalaDeDesign(comFormato("9:16", "1080p"))).toBeCloseTo(1, 5);
  });

  it("é igual em TODAS as proporções para a mesma resolução", () => {
    // O lado curto do espaço de design é 1080 em todas — trocar de proporção
    // não pode mudar a nitidez do resultado. É o que permite acrescentar um
    // formato novo (4:5, 1:1) sem recalibrar nada.
    const referencia = escalaDeDesign(comFormato("16:9", "720p"));
    for (const aspectRatio of Object.keys(DESIGN) as AspectRatio[]) {
      expect(escalaDeDesign(comFormato(aspectRatio, "720p"))).toBeCloseTo(referencia, 5);
    }
  });

  it("cada proporção sai com a forma que o nome promete", () => {
    const forma = (aspectRatio: AspectRatio) => {
      const { width, height } = dimensoesDaSaida(comFormato(aspectRatio, "1080p"));
      return width / height;
    };

    expect(forma("16:9")).toBeCloseTo(16 / 9, 2);
    expect(forma("9:16")).toBeCloseTo(9 / 16, 2);
    expect(forma("4:5")).toBeCloseTo(4 / 5, 2);
    expect(forma("1:1")).toBeCloseTo(1, 2);
  });
});
