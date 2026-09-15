import { describe, expect, it } from "vitest";
import { combinarFiltros, filtroDeCor } from "../cor";
import { SETTINGS_PADRAO } from "../../settings";

const fundo = (parcial: Partial<typeof SETTINGS_PADRAO.background> = {}) => ({
  ...SETTINGS_PADRAO.background,
  ...parcial,
});

/** O número dentro de `saturate(1.400)`, por exemplo. */
const valorDe = (filtro: string, funcao: string) => {
  const m = new RegExp(`${funcao}\\((-?[\\d.]+)`).exec(filtro);
  return m ? Number(m[1]) : null;
};

describe("filtroDeCor", () => {
  it("devolve 'none' quando tudo está neutro", () => {
    expect(filtroDeCor(fundo({ reacaoBatida: 0 }), 0)).toBe("none");
  });

  /**
   * Isto já foi shader, e virar CSS foi a correção: `filter` é composto pela
   * GPU do navegador sem custo por quadro, enquanto cada ajuste como shader
   * era um passe de quadro inteiro numa cadeia que roda a cada quadro.
   */
  it("sai como um `filter` de CSS, não como pilha de efeitos", () => {
    const f = filtroDeCor(fundo({ saturacao: 1.4, contraste: 1.2, reacaoBatida: 0 }), 0);
    expect(f).toMatch(/^saturate\([\d.]+\) contrast\([\d.]+\)$/);
  });

  it("cada controle aparece só quando sai do neutro", () => {
    const so = (parcial: Partial<typeof SETTINGS_PADRAO.background>) =>
      filtroDeCor(fundo({ ...parcial, reacaoBatida: 0 }), 0);
    expect(so({ saturacao: 1.5 })).toBe("saturate(1.500)");
    expect(so({ contraste: 0.8 })).toBe("contrast(0.800)");
    expect(so({ brilho: 1.2 })).toBe("brightness(1.200)");
    expect(so({ matiz: 40 })).toBe("hue-rotate(40deg)");
    expect(so({ blur: 12 })).toBe("blur(12px)");
  });

  it("saturação e brilho nunca ficam negativos", () => {
    const f = filtroDeCor(fundo({ saturacao: -2, brilho: -3, reacaoBatida: 0 }), 0);
    expect(valorDe(f, "saturate")).toBeGreaterThanOrEqual(0);
    expect(valorDe(f, "brightness")).toBeGreaterThanOrEqual(0);
  });

  it("a batida levanta cor e brilho, e só quando reacaoBatida permite", () => {
    expect(filtroDeCor(fundo({ reacaoBatida: 0 }), 1)).toBe("none");
    const comBatida = filtroDeCor(fundo({ reacaoBatida: 1 }), 1);
    expect(valorDe(comBatida, "saturate")).toBeGreaterThan(1);
    expect(valorDe(comBatida, "brightness")).toBeGreaterThan(1);
  });

  it("é determinístico — mesma entrada, mesma string", () => {
    expect(filtroDeCor(fundo({ saturacao: 1.3 }), 0.4)).toBe(filtroDeCor(fundo({ saturacao: 1.3 }), 0.4));
  });
});

describe("combinarFiltros", () => {
  it("descarta os neutros", () => {
    expect(combinarFiltros("none", "sepia(1)", "")).toBe("sepia(1)");
  });

  it("devolve 'none' quando não sobra nada", () => {
    expect(combinarFiltros("none", "")).toBe("none");
  });

  it("junta na ordem recebida — gradação primeiro, textura depois", () => {
    expect(combinarFiltros("saturate(1.2)", "sepia(0.8)")).toBe("saturate(1.2) sepia(0.8)");
  });
});
