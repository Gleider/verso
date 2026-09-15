import { describe, expect, it } from "vitest";
import {
  chaveDaCombinacao,
  EFEITOS_GL,
  FUNDOS_GERADOS,
  montarFragmento,
  VERTEX,
  type Combinacao,
} from "../fonte";
import {
  combinacaoDe,
  corParaRgb,
  ehEfeitoGl,
  ehFundoGerado,
  precisaDeGl,
  uniformesDe,
} from "../uniformes";
import { SETTINGS_PADRAO, type VideoSettings } from "../../settings";

const comSettings = (parcial: {
  background?: Partial<VideoSettings["background"]>;
  style?: Partial<VideoSettings["style"]>;
}): VideoSettings => ({
  ...SETTINGS_PADRAO,
  background: { ...SETTINGS_PADRAO.background, ...parcial.background },
  style: { ...SETTINGS_PADRAO.style, ...parcial.style },
});

describe("corParaRgb", () => {
  it("converte #rrggbb para 0..1", () => {
    expect(corParaRgb("#ffffff")).toEqual([1, 1, 1]);
    expect(corParaRgb("#000000")).toEqual([0, 0, 0]);
    expect(corParaRgb("#ff0000")).toEqual([1, 0, 0]);
  });

  it("aceita sem cerquilha e com espaço em volta", () => {
    expect(corParaRgb("  ffffff ")).toEqual([1, 1, 1]);
  });

  it("valor inválido vira preto em vez de NaN", () => {
    // NaN num uniform não dá erro: dá tela preta ou lixo, sem diagnóstico.
    for (const ruim of ["", "azul", "#fff", "#12345g"]) {
      expect(corParaRgb(ruim)).toEqual([0, 0, 0]);
    }
  });
});

describe("precisaDeGl", () => {
  /**
   * A decisão mais cara da tela: com `false`, nenhum canvas é montado e o
   * preview fica em 60 fps. Medido: cada passe de shader custa ~7 ms.
   */
  it("é falso no caminho padrão — cor sólida, sem textura", () => {
    expect(precisaDeGl(SETTINGS_PADRAO)).toBe(false);
  });

  it("é falso com foto da biblioteca e textura CSS", () => {
    const s = comSettings({
      background: { kind: "library", ref: "nebulosa" },
      style: { texture: "grain" },
    });
    expect(precisaDeGl(s)).toBe(false);
  });

  it("é verdadeiro com fundo gerado", () => {
    expect(precisaDeGl(comSettings({ background: { kind: "library", ref: "vinil" } }))).toBe(true);
  });

  it("é verdadeiro com textura de GPU", () => {
    expect(precisaDeGl(comSettings({ style: { texture: "vhs" } }))).toBe(true);
  });

  it("textura aposentada não liga canvas", () => {
    // `paper` saiu do catálogo; o id continua válido no schema.
    expect(precisaDeGl(comSettings({ style: { texture: "paper" } }))).toBe(false);
  });
});

describe("combinacaoDe", () => {
  it("fundo gerado tem precedência sobre a imagem", () => {
    // O gerador desenha o quadro inteiro: amostrar a foto junto não faria
    // sentido, e ligaria uma textura que ninguém lê.
    const c = combinacaoDe(comSettings({ background: { kind: "library", ref: "aurora" } }), true);
    expect(c.fundo).toBe("aurora");
    expect(c.temImagem).toBe(false);
  });

  it("foto da biblioteca não é fundo gerado", () => {
    const c = combinacaoDe(comSettings({ background: { kind: "library", ref: "dunas" } }), true);
    expect(c.fundo).toBeNull();
    expect(c.temImagem).toBe(true);
  });

  it("ref inválido não vira fundo gerado", () => {
    const c = combinacaoDe(comSettings({ background: { kind: "library", ref: "xyz" } }), false);
    expect(c.fundo).toBeNull();
  });
});

describe("uniformesDe", () => {
  it("limita pulso e intensidades a 0..1", () => {
    const s = comSettings({
      background: { ambientIntensity: 5 },
      style: { textureIntensity: -3 },
    });
    const u = uniformesDe(s, 1000, 9, [1920, 1080]);
    expect(u.pulso).toBe(1);
    expect(u.ambiente).toBe(1);
    expect(u.intensidade).toBe(0);
  });

  it("é determinístico", () => {
    const a = uniformesDe(SETTINGS_PADRAO, 1234, 0.5, [1920, 1080]);
    const b = uniformesDe(SETTINGS_PADRAO, 1234, 0.5, [1920, 1080]);
    expect(a).toEqual(b);
  });
});

describe("guardas de id", () => {
  it("reconhece os fundos gerados e recusa o resto", () => {
    expect(ehFundoGerado("vinil")).toBe(true);
    expect(ehFundoGerado("nebulosa")).toBe(false);
    expect(ehFundoGerado(null)).toBe(false);
  });

  it("reconhece os efeitos de GPU e recusa os CSS", () => {
    expect(ehEfeitoGl("vhs")).toBe(true);
    expect(ehEfeitoGl("grain")).toBe(false);
  });
});

/**
 * O shader é montado por texto: um efeito esquecido no `main()` não dá erro
 * de compilação, dá um efeito que simplesmente não acontece. Estes testes
 * fixam a estrutura.
 */
describe("montagem do shader", () => {
  const TODAS: Combinacao[] = [
    { fundo: null, efeito: null, temImagem: false },
    { fundo: null, efeito: null, temImagem: true },
    ...FUNDOS_GERADOS.map((fundo) => ({ fundo, efeito: null, temImagem: false })),
    ...EFEITOS_GL.map((efeito) => ({ fundo: null, efeito, temImagem: true })),
    ...EFEITOS_GL.map((efeito) => ({ fundo: "vinil" as const, efeito, temImagem: false })),
  ];

  it("o vértice declara a versão na primeira linha", () => {
    // `#version` fora da primeira linha é erro de compilação em GLSL ES 3.0.
    expect(VERTEX.split("\n")[0]).toBe("#version 300 es");
  });

  it.each(TODAS.map((c) => [chaveDaCombinacao(c), c] as const))(
    "%s monta um fragmento estruturalmente válido",
    (_chave, c) => {
      const src = montarFragmento(c);
      expect(src.split("\n")[0]).toBe("#version 300 es");
      expect(src).toContain("void main()");
      expect(src).toContain("fragColor =");
      // Chaves desbalanceadas são o erro mais fácil de cometer montando texto.
      expect((src.match(/\{/g) ?? []).length).toBe((src.match(/\}/g) ?? []).length);
    },
  );

  it.each(EFEITOS_GL)("o efeito %s é de fato chamado no main()", (efeito) => {
    const src = montarFragmento({ fundo: null, efeito, temImagem: true });
    const corpo = src.slice(src.indexOf("void main()"));
    expect(corpo).toMatch(/ef_/);
  });

  it.each(FUNDOS_GERADOS)("o fundo %s é de fato usado pela amostragem", (fundo) => {
    const src = montarFragmento({ fundo, efeito: null, temImagem: false });
    expect(src).toContain(`fundo_${fundo}(uv`);
  });

  it("sem fundo gerado e sem imagem, amostra a cor sólida", () => {
    expect(montarFragmento({ fundo: null, efeito: null, temImagem: false })).toContain(
      "return uCor;",
    );
  });

  it("com imagem, amostra a textura enquadrada", () => {
    expect(montarFragmento({ fundo: null, efeito: null, temImagem: true })).toContain(
      "return textureCoberta(uv);",
    );
  });

  it("combinações diferentes têm chaves diferentes", () => {
    // Chave repetida faria o cache devolver o programa errado — e o efeito
    // escolhido simplesmente não apareceria.
    const chaves = TODAS.map(chaveDaCombinacao);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});
