/**
 * Silabificação usada pelo destaque do player.
 *
 * O objetivo não é rigor linguístico: é dar a cada pedaço da palavra a fatia de
 * tempo que ele realmente ocupa no canto, para o preenchimento parar de
 * escorregar em relação ao que se ouve.
 */
import { describe, expect, it } from "vitest";
import { splitSyllables, syllableWeights, timeSyllables } from "../syllables";

const texts = (word: string, lang = "pt") => splitSyllables(word, lang).map((s) => s.text);

describe("splitSyllables (português)", () => {
  it("separa consoante entre vogais para a sílaba seguinte", () => {
    expect(texts("casa")).toEqual(["ca", "sa"]);
  });

  it("mantém dígrafos inseparáveis", () => {
    expect(texts("cachorro")).toEqual(["ca", "chor", "ro"]);
    expect(texts("palhaco")).toEqual(["pa", "lha", "co"]);
  });

  it("mantém ditongos numa sílaba só", () => {
    expect(texts("pai")).toEqual(["pai"]);
    expect(texts("saudade")).toEqual(["sau", "da", "de"]);
  });

  it("separa hiatos em sílabas diferentes", () => {
    // Duas vogais fortes nunca formam ditongo.
    expect(texts("poeta")).toEqual(["po", "e", "ta"]);
  });

  it("mantém encontros consonantais inseparáveis no ataque", () => {
    expect(texts("prato")).toEqual(["pra", "to"]);
    expect(texts("livro")).toEqual(["li", "vro"]);
  });

  it("deixa consoante travada como coda", () => {
    expect(texts("transporte")).toEqual(["trans", "por", "te"]);
  });

  it("trata nasais e acentos", () => {
    expect(texts("coração")).toEqual(["co", "ra", "ção"]);
    expect(texts("pães")).toEqual(["pães"]);
  });

  it("devolve o monossílabo inteiro", () => {
    expect(texts("sol")).toEqual(["sol"]);
    expect(texts("três")).toEqual(["três"]);
  });

  it("não quebra com entradas degeneradas", () => {
    expect(texts("")).toEqual([]);
    expect(texts("!?")).toEqual(["!?"]);
    expect(texts("ok")).toEqual(["ok"]);
  });

  it("preserva a palavra inteira ao juntar as sílabas", () => {
    for (const word of ["coração", "transporte", "saudade", "cachorro", "psicologia"]) {
      expect(splitSyllables(word, "pt").map((s) => s.text).join("")).toBe(word);
    }
  });
});

describe("splitSyllables (inglês)", () => {
  it("agrupa por núcleos vocálicos", () => {
    expect(texts("running", "en")).toEqual(["run", "ning"]);
  });

  it("não corta antes de um 'e' final mudo", () => {
    expect(texts("time", "en")).toEqual(["time"]);
    expect(texts("alone", "en")).toEqual(["a", "lone"]);
  });
});

describe("syllableWeights", () => {
  it("dá mais peso à sílaba tônica que às átonas", () => {
    const [primeira, segunda] = syllableWeights(splitSyllables("casa", "pt"), "pt");
    expect(primeira).toBeGreaterThan(segunda); // "ca-sa" é paroxítona
  });

  it("dá mais peso a sílaba com ditongo do que a uma sílaba simples", () => {
    const comDitongo = syllableWeights(splitSyllables("pai", "pt"), "pt")[0];
    const simples = syllableWeights(splitSyllables("pa", "pt"), "pt")[0];
    expect(comDitongo).toBeGreaterThan(simples);
  });

  it("segue o acento gráfico quando existe", () => {
    const pesos = syllableWeights(splitSyllables("coração", "pt"), "pt");
    expect(pesos[2]).toBeGreaterThan(pesos[0]);
    expect(pesos[2]).toBeGreaterThan(pesos[1]);
  });
});

describe("timeSyllables", () => {
  const palavra = { w: "casa", s: 1000, e: 1800 };

  it("cobre exatamente o intervalo da palavra", () => {
    const segmentos = timeSyllables(palavra, "pt");
    expect(segmentos[0].s).toBe(1000);
    expect(segmentos[segmentos.length - 1].e).toBe(1800);
  });

  it("não deixa buracos nem sobreposição entre sílabas", () => {
    const segmentos = timeSyllables({ w: "transporte", s: 0, e: 900 }, "pt");
    for (let i = 1; i < segmentos.length; i += 1) {
      expect(segmentos[i].s).toBe(segmentos[i - 1].e);
    }
  });

  it("dá à tônica mais tempo que à átona", () => {
    const [ca, sa] = timeSyllables(palavra, "pt");
    expect(ca.e - ca.s).toBeGreaterThan(sa.e - sa.s);
  });

  it("devolve um único segmento para palavra de uma sílaba", () => {
    const segmentos = timeSyllables({ w: "sol", s: 500, e: 900 }, "pt");
    expect(segmentos).toHaveLength(1);
    expect(segmentos[0]).toMatchObject({ text: "sol", s: 500, e: 900 });
  });

  it("aguenta palavra de duração zero", () => {
    const segmentos = timeSyllables({ w: "casa", s: 700, e: 700 }, "pt");
    expect(segmentos.every((seg) => seg.s === 700 && seg.e === 700)).toBe(true);
  });
});
