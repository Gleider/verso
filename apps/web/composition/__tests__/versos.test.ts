import { describe, expect, it } from "vitest";
import { indiceDoVersoAtivo, prepararVersos } from "../versos";
import type { LyricLine, WordTiming } from "../../lib/types";

const w = (text: string, s: number, e: number): WordTiming => ({ w: text, s, e, p: 1 });

function linha(parcial: Partial<LyricLine> & { id: string }): LyricLine {
  return {
    idx: 0,
    text: "",
    start_ms: 0,
    end_ms: 1000,
    words: [],
    needs_realign: false,
    starts_stanza: false,
    reviewed: true,
    nudge_ms: 0,
    ...parcial,
  };
}

describe("prepararVersos", () => {
  it("desloca a letra por nudge menos offset, nunca o relógio", () => {
    const linhas = [
      linha({
        id: "a",
        text: "casa",
        start_ms: 1000,
        end_ms: 2000,
        nudge_ms: 200,
        words: [w("casa", 1000, 2000)],
      }),
    ];

    // offset 300 soma nudge(200) - offset(300) = -100 ao tempo medido.
    const [verso] = prepararVersos(linhas, 300);

    expect(verso.inicioMs).toBe(900);
    expect(verso.fimMs).toBe(1900);
    expect(verso.segmentos[0].s).toBe(900);
  });

  it("descarta linhas sem start_ms — não há como posicioná-las", () => {
    const linhas = [
      linha({ id: "sem-timing", start_ms: null, end_ms: null }),
      linha({ id: "com-timing", start_ms: 500, end_ms: 1500 }),
    ];

    const versos = prepararVersos(linhas, 0);

    expect(versos).toHaveLength(1);
    expect(versos[0].id).toBe("com-timing");
  });

  it("ordena por início, mesmo se a entrada vier fora de ordem", () => {
    const linhas = [
      linha({ id: "segunda", start_ms: 5000, end_ms: 6000 }),
      linha({ id: "primeira", start_ms: 1000, end_ms: 2000 }),
    ];

    const versos = prepararVersos(linhas, 0);

    expect(versos.map((v) => v.id)).toEqual(["primeira", "segunda"]);
  });

  it("silabifica as palavras da linha, cobrindo a duração medida", () => {
    const linhas = [
      linha({
        id: "a",
        text: "cachorro",
        start_ms: 0,
        end_ms: 1000,
        words: [w("cachorro", 0, 1000)],
      }),
    ];

    const [verso] = prepararVersos(linhas, 0);

    expect(verso.segmentos.length).toBeGreaterThan(1);
    expect(verso.segmentos[0].s).toBe(0);
    expect(verso.segmentos[verso.segmentos.length - 1].e).toBe(1000);
    // As sílabas concatenadas reproduzem a palavra exata.
    expect(verso.segmentos.map((s) => s.texto).join("")).toBe("cachorro");
  });

  it("concatenar os segmentos de uma linha com várias palavras reproduz o texto com espaços", () => {
    // Defeito real: sem espaço entre as sílabas da última palavra e a
    // primeira da próxima, renderizar por sílaba colava as palavras.
    const linhas = [
      linha({
        id: "a",
        text: "casa grande",
        start_ms: 0,
        end_ms: 1000,
        words: [w("casa", 0, 400), w("grande", 500, 1000)],
      }),
    ];

    const [verso] = prepararVersos(linhas, 0);

    expect(verso.segmentos.map((s) => s.texto).join("")).toBe("casa grande");
    expect(verso.palavras.map((p) => p.texto).join("")).toBe("casa grande");
  });

  it("linha sem words não tem segmentos, mas continua exibível", () => {
    const linhas = [linha({ id: "a", text: "letra importada", start_ms: 0, end_ms: 1000 })];

    const [verso] = prepararVersos(linhas, 0);

    expect(verso.segmentos).toEqual([]);
    expect(verso.texto).toBe("letra importada");
  });
});

describe("indiceDoVersoAtivo", () => {
  const versos = prepararVersos(
    [
      linha({ id: "a", start_ms: 0, end_ms: 1000 }),
      linha({ id: "b", start_ms: 1000, end_ms: 2000 }),
      linha({ id: "c", start_ms: 2000, end_ms: 3000 }),
    ],
    0,
  );

  it("acha o verso cujo início é o mais recente até o instante", () => {
    expect(indiceDoVersoAtivo(versos, 1500)).toBe(1);
  });

  it("é -1 antes do primeiro verso começar", () => {
    expect(indiceDoVersoAtivo(versos, -1)).toBe(-1);
  });

  it("não quebra com lista vazia", () => {
    expect(indiceDoVersoAtivo([], 500)).toBe(-1);
  });
});
