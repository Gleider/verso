/**
 * Sincronia entre o áudio e os versos.
 *
 * A lógica é curta mas cheia de bordas: antes do primeiro verso, depois do
 * último, e versos importados que ainda não têm timing medido.
 */
import { describe, expect, it } from "vitest";
import { activeLineIndex, centerOffset, lineProgress, wordCursor } from "../sync";

// Versos de exemplo escritos para este teste.
const LINHAS = [
  { start_ms: 1000, end_ms: 2300 },
  { start_ms: 3200, end_ms: 4300 },
  { start_ms: 5000, end_ms: 6500 },
];

describe("activeLineIndex", () => {
  it("devolve -1 antes do primeiro verso", () => {
    expect(activeLineIndex(LINHAS, 0)).toBe(-1);
    expect(activeLineIndex(LINHAS, 999)).toBe(-1);
  });

  it("acende o verso no instante exato em que ele começa", () => {
    expect(activeLineIndex(LINHAS, 1000)).toBe(0);
    expect(activeLineIndex(LINHAS, 3200)).toBe(1);
  });

  it("mantém o verso aceso durante toda a sua duração", () => {
    expect(activeLineIndex(LINHAS, 1500)).toBe(0);
    expect(activeLineIndex(LINHAS, 2299)).toBe(0);
  });

  it("mantém o último verso aceso no intervalo até o próximo", () => {
    // Entre 2300 e 3200 não há canto; o verso anterior continua em destaque
    // em vez de a tela ficar vazia.
    expect(activeLineIndex(LINHAS, 2800)).toBe(0);
  });

  it("mantém o último verso aceso depois do fim da música", () => {
    expect(activeLineIndex(LINHAS, 99999)).toBe(2);
  });

  it("pula versos sem timing em vez de quebrar", () => {
    const comBuracos = [
      { start_ms: 1000, end_ms: 2000 },
      { start_ms: null, end_ms: null }, // verso importado, ainda sem alinhar
      { start_ms: 5000, end_ms: 6000 },
    ];
    expect(activeLineIndex(comBuracos, 1500)).toBe(0);
    expect(activeLineIndex(comBuracos, 5500)).toBe(2);
  });

  it("não quebra com lista vazia", () => {
    expect(activeLineIndex([], 1000)).toBe(-1);
  });

  it("não quebra quando nenhum verso tem timing", () => {
    expect(activeLineIndex([{ start_ms: null, end_ms: null }], 1000)).toBe(-1);
  });
});

describe("lineProgress", () => {
  it("vai de 0 a 1 ao longo do verso", () => {
    expect(lineProgress(LINHAS[0], 1000)).toBe(0);
    expect(lineProgress(LINHAS[0], 1650)).toBeCloseTo(0.5, 1);
    expect(lineProgress(LINHAS[0], 2300)).toBe(1);
  });

  it("fica preso nas pontas fora do intervalo", () => {
    expect(lineProgress(LINHAS[0], 0)).toBe(0);
    expect(lineProgress(LINHAS[0], 9999)).toBe(1);
  });

  it("devolve 0 para verso sem timing", () => {
    expect(lineProgress({ start_ms: null, end_ms: null }, 1000)).toBe(0);
  });

  it("devolve 0 quando início e fim coincidem", () => {
    expect(lineProgress({ start_ms: 500, end_ms: 500 }, 500)).toBe(0);
  });
});

describe("centerOffset", () => {
  // A referência é a ALTURA DA JANELA VISÍVEL, nunca a da lista inteira:
  // usar a altura da lista joga o conteúdo para fora da tela.
  const JANELA = 800;

  it("centraliza o verso na janela", () => {
    // verso de 100px começando em 1000 -> meio em 1050; meio da janela em 400
    expect(centerOffset(1000, 100, JANELA)).toBe(650);
  });

  it("devolve deslocamento negativo quando o verso está acima do centro", () => {
    // empurra a lista para baixo para trazer o verso ao meio
    expect(centerOffset(0, 100, JANELA)).toBe(-350);
  });

  it("não depende de quantos versos existem na lista", () => {
    // o mesmo verso, na mesma posição, dá o mesmo resultado em qualquer letra
    expect(centerOffset(1000, 100, JANELA)).toBe(centerOffset(1000, 100, JANELA));
  });

  it("devolve 0 quando a janela ainda não foi medida", () => {
    expect(centerOffset(1000, 100, 0)).toBe(0);
  });
});

describe("offset da letra", () => {
  // Convenção: offset positivo ADIANTA a letra (ela acende antes do canto).
  // Quem aplica é o player, somando o offset ao tempo do áudio.
  const LINHA_UNICA = [{ start_ms: 2000, end_ms: 3000 }];

  it("sem offset, o verso só acende no tempo medido", () => {
    expect(activeLineIndex(LINHA_UNICA, 1800)).toBe(-1);
  });

  it("offset positivo faz o verso acender antes", () => {
    expect(activeLineIndex(LINHA_UNICA, 1800 + 300)).toBe(0);
  });

  it("offset negativo segura o verso para depois", () => {
    expect(activeLineIndex(LINHA_UNICA, 2100 - 300)).toBe(-1);
  });
});

describe("wordCursor", () => {
  // Tokens neutros: o que importa aqui são os tempos, não o texto.
  const PALAVRAS = [
    { s: 1000, e: 1400 },
    { s: 1400, e: 2000 },
    { s: 2200, e: 2600 }, // respiro de 200ms antes desta
  ];

  it("não destaca nada antes da primeira palavra", () => {
    expect(wordCursor(PALAVRAS, 500)).toEqual({ index: -1, fill: 0 });
  });

  it("começa a preencher a palavra no instante em que ela entra", () => {
    expect(wordCursor(PALAVRAS, 1000)).toEqual({ index: 0, fill: 0 });
  });

  it("preenche proporcionalmente ao longo da palavra", () => {
    const cursor = wordCursor(PALAVRAS, 1200);
    expect(cursor.index).toBe(0);
    expect(cursor.fill).toBeCloseTo(0.5, 2);
  });

  it("mantém a palavra cheia durante o respiro até a próxima", () => {
    // Entre 2000 e 2200 ninguém canta: a palavra anterior fica completa
    // em vez de o destaque piscar de volta.
    expect(wordCursor(PALAVRAS, 2100)).toEqual({ index: 1, fill: 1 });
  });

  it("mantém a última palavra cheia depois do fim do verso", () => {
    expect(wordCursor(PALAVRAS, 9999)).toEqual({ index: 2, fill: 1 });
  });

  it("não quebra sem palavras", () => {
    expect(wordCursor([], 1000)).toEqual({ index: -1, fill: 0 });
  });

  it("trata palavra de duração zero como já completa", () => {
    expect(wordCursor([{ s: 500, e: 500 }], 500)).toEqual({ index: 0, fill: 1 });
  });
});
