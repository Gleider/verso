import { describe, expect, it } from "vitest";
import { CATALOGO_DE_TEXTURAS, itemDeTextura } from "../catalogo";
import { ehTexturaShader, TEXTURAS, texturaShaderPorId } from "../texturas";
import { ehTexturaCss, TEXTURAS_CSS, texturaCssPorId } from "../texturas-css";
import { EFEITOS_GL } from "../../gl/fonte";

describe("catálogo", () => {
  it("não há id repetido, nem dentro de cada família nem entre elas", () => {
    const ids = CATALOGO_DE_TEXTURAS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cada id pertence a UMA família só", () => {
    // Se um id estivesse nas duas, `Fundo.tsx` montaria canvas e ainda
    // aplicaria a camada CSS — o efeito sairia em dobro.
    for (const { id } of CATALOGO_DE_TEXTURAS) {
      expect(ehTexturaCss(id) && ehTexturaShader(id)).toBe(false);
    }
  });

  it("as texturas de GPU são exatamente as que o shader sabe montar", () => {
    // Um id aqui sem função no GLSL daria tela preta, sem erro nenhum.
    expect([...TEXTURAS.map((t) => t.id)].sort()).toEqual([...EFEITOS_GL].sort());
  });

  it("id desconhecido não quebra nem liga canvas à toa", () => {
    // Dado antigo ou corrompido no JSONB não pode derrubar o render. Vale
    // também para as texturas aposentadas (papel, térmico, relevo...).
    expect(texturaShaderPorId("inexistente")).toBeNull();
    expect(texturaCssPorId("inexistente" as never)).toBeNull();
    expect(ehTexturaShader("paper")).toBe(false);
    expect(itemDeTextura("inexistente" as never).id).toBe("none");
  });

  /**
   * O caminho padrão do editor não pode ligar a cadeia de shaders. É o que
   * separa 60 fps de 31: sem canvas, o fundo é um `<div>` e o navegador
   * compõe tudo sem custo por quadro.
   */
  it("'none' é CSS, não shader — o padrão dispensa canvas", () => {
    expect(ehTexturaCss("none")).toBe(true);
    expect(ehTexturaShader("none")).toBe(false);
  });

  it("as texturas baratas ficam na família CSS", () => {
    // Grão, sépia, vinheta e poeira não amostram pixels: não há motivo para
    // custarem uma cadeia de canvas por quadro.
    for (const id of ["grain", "sepia", "vignette", "dust", "monocromatico"] as const) {
      expect(ehTexturaCss(id)).toBe(true);
    }
  });

  it("toda textura tem rótulo e descrição — o nome sozinho não diz o que faz", () => {
    for (const t of CATALOGO_DE_TEXTURAS) {
      expect(t.rotulo.length).toBeGreaterThan(2);
      expect(t.descricao.length).toBeGreaterThan(10);
    }
  });
});

describe("texturas em CSS", () => {
  it.each(TEXTURAS_CSS.map((t) => t.id))("%s é determinística", (id) => {
    const a = texturaCssPorId(id)!.estado(4_200, 0.6, 0.3);
    const b = texturaCssPorId(id)!.estado(4_200, 0.6, 0.3);
    expect(a).toEqual(b);
  });

  it.each(TEXTURAS_CSS.map((t) => t.id))("%s produz filtro ou camada (menos 'none')", (id) => {
    const e = texturaCssPorId(id)!.estado(4_200, 0.6, 0.3);
    if (id === "none") {
      expect(e.filtro).toBe("none");
      expect(e.camadas).toHaveLength(0);
    } else {
      expect(e.filtro !== "none" || e.camadas.length > 0).toBe(true);
    }
  });

  it.each(["grain", "sepia", "dust"] as const)(
    "%s continua se mexendo no tempo — textura parada parece imagem congelada",
    (id) => {
      const a = texturaCssPorId(id)!.estado(0, 0.7, 0);
      const b = texturaCssPorId(id)!.estado(1_500, 0.7, 0);
      expect(a.camadas).not.toEqual(b.camadas);
    },
  );

  it("a intensidade muda o resultado em todas menos 'none'", () => {
    for (const t of TEXTURAS_CSS) {
      if (t.id === "none") continue;
      expect(t.estado(500, 0, 0)).not.toEqual(t.estado(500, 1, 0));
    }
  });
});
