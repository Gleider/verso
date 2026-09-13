/**
 * Saneamento dos timings vindos do ASR, antes de virarem destaque.
 *
 * O Whisper não mede o áudio: os tempos saem dos pesos de atenção do modelo, e
 * vêm com defeitos característicos — durações infladas que engolem o silêncio
 * seguinte, palavras que se sobrepõem, e ocasionalmente fora de ordem. Sem
 * sanear, o preenchimento arrasta sobre trechos em que ninguém está cantando.
 */
import { describe, expect, it } from "vitest";
import { normalizeWords } from "../normalize";

const w = (text: string, s: number, e: number) => ({ w: text, s, e, p: 0.9 });

describe("normalizeWords", () => {
  it("deixa timings sãos exatamente como estão", () => {
    const entrada = [w("um", 0, 300), w("dois", 320, 700), w("tres", 700, 1000)];

    expect(normalizeWords(entrada)).toEqual(entrada);
  });

  it("corta a duração inflada da última palavra", () => {
    // Defeito clássico: a palavra final absorve o silêncio até o fim do trecho.
    const [, ultima] = normalizeWords([w("canto", 0, 500), w("fim", 500, 4200)]);

    expect(ultima.e - ultima.s).toBeLessThan(1200);
    expect(ultima.s).toBe(500); // o início medido é preservado
  });

  it("respeita sustentação plausível sem cortar", () => {
    // Uma nota segurada por ~1s é canto de verdade, não silêncio.
    const [palavra] = normalizeWords([w("amor", 0, 1000)]);

    expect(palavra.e).toBe(1000);
  });

  it("dá mais folga a palavras longas que a curtas", () => {
    const [curta] = normalizeWords([w("eu", 0, 9000)]);
    const [longa] = normalizeWords([w("saudade", 0, 9000)]);

    expect(longa.e - longa.s).toBeGreaterThan(curta.e - curta.s);
  });

  it("desfaz sobreposição entre palavras vizinhas", () => {
    const [primeira, segunda] = normalizeWords([w("vem", 0, 800), w("ca", 500, 900)]);

    expect(primeira.e).toBeLessThanOrEqual(segunda.s);
  });

  it("reordena palavras que chegam fora de sequência", () => {
    // A busca binária do destaque pressupõe ordem crescente.
    const saida = normalizeWords([w("dois", 500, 800), w("um", 0, 400)]);

    expect(saida.map((item) => item.w)).toEqual(["um", "dois"]);
  });

  it("garante que o fim nunca vem antes do início", () => {
    const [palavra] = normalizeWords([w("erro", 900, 400)]);

    expect(palavra.e).toBeGreaterThanOrEqual(palavra.s);
  });

  it("preserva silêncio real entre palavras", () => {
    // Um respiro de 2s entre versos não deve ser preenchido artificialmente.
    const [primeira, segunda] = normalizeWords([w("fim", 0, 400), w("novo", 2400, 2800)]);

    expect(primeira.e).toBe(400);
    expect(segunda.s).toBe(2400);
  });

  it("mantém a ordem estritamente crescente na saída", () => {
    const saida = normalizeWords([
      w("a", 0, 5000),
      w("b", 100, 200),
      w("c", 4000, 4100),
      w("d", 50, 60),
    ]);

    for (let i = 1; i < saida.length; i += 1) {
      expect(saida[i].s).toBeGreaterThanOrEqual(saida[i - 1].s);
      expect(saida[i - 1].e).toBeLessThanOrEqual(saida[i].s);
    }
  });

  it("não quebra com lista vazia", () => {
    expect(normalizeWords([])).toEqual([]);
  });

  it("preserva o texto e a confiança de cada palavra", () => {
    const saida = normalizeWords([{ w: "teste", s: 0, e: 9000, p: 0.42 }]);

    expect(saida[0].w).toBe("teste");
    expect(saida[0].p).toBe(0.42);
  });
});
