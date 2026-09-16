/**
 * O rascunho é o que o editor de letra manipula: versos com texto, tempo e
 * marca de estrofe, antes de virarem uma versão no banco.
 *
 * Duas decisões moram aqui e são a razão dos testes:
 *
 * 1. O tempo que aparece na tela é o EFETIVO (medido + nudge − offset), o mesmo
 *    que o vídeo desenha. Mostrar o medido cru faria o editor discordar do
 *    player em toda faixa com ajuste.
 * 2. Mudar o tempo de um verso que já existe nunca sobrescreve o que o modelo
 *    mediu: vira `nudge_ms`, que é reversível (ver .claude/rules/domain.md).
 */
import { describe, expect, it } from "vitest";
import {
  LIMITE_NUDGE_MS,
  comTempo,
  formatarTimecode,
  oQueSalvar,
  paraRascunho,
  parseTimecode,
  versoNovo,
} from "../rascunho";
import type { LyricLine } from "../types";

function linha(parcial: Partial<LyricLine> & { id: string; idx: number }): LyricLine {
  return {
    text: "um verso qualquer",
    start_ms: 1000,
    end_ms: 2000,
    words: [],
    needs_realign: false,
    starts_stanza: false,
    reviewed: false,
    nudge_ms: 0,
    ...parcial,
  };
}

describe("paraRascunho", () => {
  it("mostra o tempo efetivo, com nudge e offset somados", () => {
    const linhas = [linha({ id: "a", idx: 0, start_ms: 10_000, nudge_ms: 500 })];

    const [verso] = paraRascunho(linhas, 200);

    expect(verso.tempoMs).toBe(10_300); // 10000 + 500 − 200
    expect(verso.medidoMs).toBe(10_000); // o dado do modelo continua intacto
  });

  it("aceita verso sem timing nenhum", () => {
    const [verso] = paraRascunho([linha({ id: "a", idx: 0, start_ms: null })], 0);

    expect(verso.tempoMs).toBeNull();
  });
});

describe("comTempo", () => {
  it("move um verso existente pelo nudge, sem tocar no que foi medido", () => {
    const [verso] = paraRascunho([linha({ id: "a", idx: 0, start_ms: 10_000 })], 0);

    const movido = comTempo(verso, 12_500, 0);

    expect(movido.medidoMs).toBe(10_000);
    expect(movido.nudgeMs).toBe(2_500);
    expect(movido.tempoMs).toBe(12_500);
  });

  it("desconta o offset da faixa ao calcular o ajuste", () => {
    const [verso] = paraRascunho([linha({ id: "a", idx: 0, start_ms: 10_000 })], 300);

    const movido = comTempo(verso, 10_000, 300);

    // O usuário quer o verso em 10 s na tela; com a letra 300 ms adiantada,
    // o ajuste precisa devolver esses 300 ms.
    expect(movido.nudgeMs).toBe(300);
    expect(movido.tempoMs).toBe(10_000);
  });

  it("um ponto de legenda novo grava o tempo direto, sem ajuste", () => {
    const novo = versoNovo(45_000, 0);

    const movido = comTempo(novo, 47_000, 0);

    expect(movido.nudgeMs).toBe(0);
    expect(movido.medidoMs).toBe(47_000);
  });

  it("não deixa o ajuste passar do limite que a API aceita", () => {
    const [verso] = paraRascunho([linha({ id: "a", idx: 0, start_ms: 0 })], 0);

    const movido = comTempo(verso, LIMITE_NUDGE_MS + 5_000, 0);

    expect(movido.nudgeMs).toBe(LIMITE_NUDGE_MS);
  });

  it("nunca produz tempo negativo", () => {
    const [verso] = paraRascunho([linha({ id: "a", idx: 0, start_ms: 1_000 })], 0);

    expect(comTempo(verso, -5_000, 0).tempoMs).toBe(0);
  });
});

describe("parseTimecode", () => {
  it("lê o formato que o editor mostra", () => {
    expect(parseTimecode("01:02.34")).toBe(62_340);
  });

  it("aceita sem os centésimos", () => {
    expect(parseTimecode("2:05")).toBe(125_000);
  });

  it("aceita segundos soltos", () => {
    expect(parseTimecode("7.5")).toBe(7_500);
  });

  it("recusa o que não é tempo", () => {
    expect(parseTimecode("")).toBeNull();
    expect(parseTimecode("daqui a pouco")).toBeNull();
  });

  it("volta do que formatarTimecode escreveu", () => {
    expect(parseTimecode(formatarTimecode(93_210))).toBe(93_210);
  });
});

describe("oQueSalvar", () => {
  const originais = paraRascunho(
    [
      linha({ id: "a", idx: 0, text: "o cachorro atravessou", start_ms: 1_000 }),
      linha({ id: "b", idx: 1, text: "a casa amarela", start_ms: 3_000 }),
    ],
    0,
  );

  it("nada mudou: não salva nada", () => {
    expect(oQueSalvar(originais, originais)).toBeNull();
  });

  it("texto alterado cria versão", () => {
    const atuais = originais.map((v, i) => (i === 0 ? { ...v, texto: "outro texto" } : v));

    expect(oQueSalvar(atuais, originais)).toBe("versao");
  });

  it("verso a mais cria versão", () => {
    expect(oQueSalvar([...originais, versoNovo(9_000, 0)], originais)).toBe("versao");
  });

  it("verso a menos cria versão", () => {
    expect(oQueSalvar(originais.slice(1), originais)).toBe("versao");
  });

  it("confirmar uma linha cria versão", () => {
    const atuais = originais.map((v, i) => (i === 0 ? { ...v, revisado: true } : v));

    expect(oQueSalvar(atuais, originais)).toBe("versao");
  });

  it("só o tempo mudou: grava in-place, sem versão nova", () => {
    // É a regra do domínio: versionar é sobre o que a letra DIZ.
    const atuais = originais.map((v, i) => (i === 1 ? comTempo(v, 3_400, 0) : v));

    expect(oQueSalvar(atuais, originais)).toBe("tempo");
  });

  it("texto e tempo juntos criam versão, e o tempo vai junto nela", () => {
    const atuais = originais.map((v, i) =>
      i === 0 ? comTempo({ ...v, texto: "corrigido" }, 1_500, 0) : v,
    );

    expect(oQueSalvar(atuais, originais)).toBe("versao");
  });
});
