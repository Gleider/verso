/**
 * Movimento contínuo do fundo.
 *
 * Estes testes vieram de `lib/__tests__/beat.test.ts`, que guardava as mesmas
 * garantias para o `ambientScale`/`visualState` do player antigo. O player
 * virou a composição Remotion e o comportamento migrou para `ambiente.ts`;
 * as travas vieram junto, porque o defeito que elas impedem não mudou:
 *
 * - amplitude pequena demais é indistinguível de efeito quebrado
 *   (`pitfalls.md` §12);
 * - escala insuficiente para o deslocamento descobre a borda da imagem e
 *   aparece tarja preta — some com a imagem parada, volta no movimento.
 */
import { describe, expect, it } from "vitest";
import { AMBIENTE_PARADO, escalaSegura, estadoAmbiente } from "../ambiente";
import type { AmbientId } from "../settings";

const AMBIENTES: AmbientId[] = ["breathe", "pulse", "drift", "sway", "zoom", "none"];
const COM_MOVIMENTO: AmbientId[] = ["breathe", "pulse", "drift", "sway", "zoom"];

/** 16:9 e 9:16 — a mesma rotação descobre bordas diferentes em cada um. */
const PROPORCOES = [16 / 9, 9 / 16];

interface Transformacao {
  x: number;
  y: number;
  graus: number;
  escala: number;
}

/**
 * Lê de volta o que `estadoAmbiente` escreveu.
 *
 * O teste precisa dos números, e a função devolve a string de CSS pronta —
 * que é justamente o contrato que interessa proteger.
 */
function ler(transform: string): Transformacao {
  if (transform === "none") return { x: 0, y: 0, graus: 0, escala: 1 };
  const desloc = /translate3d\(([-\d.]+)%,\s*([-\d.]+)%/.exec(transform);
  const rotacao = /rotate\(([-\d.]+)deg\)/.exec(transform);
  const escala = /scale\(([-\d.]+)\)/.exec(transform);
  return {
    x: desloc ? Number(desloc[1]) / 100 : 0,
    y: desloc ? Number(desloc[2]) / 100 : 0,
    graus: rotacao ? Number(rotacao[1]) : 0,
    escala: escala ? Number(escala[1]) : 1,
  };
}

/**
 * A camada ainda cobre o quadro inteiro depois da transformação?
 *
 * Desfaz a transformação do CSS (`translate` → `rotate` → `scale`, aplicada da
 * direita para a esquerda) sobre os quatro cantos do quadro: se algum deles cai
 * fora da camada, ali existe pixel descoberto.
 */
function cobreOQuadro({ x, y, graus, escala }: Transformacao, proporcao: number): boolean {
  const largura = proporcao;
  const altura = 1;
  const r = (-graus * Math.PI) / 180;
  const cantos = [
    [-largura / 2, -altura / 2],
    [largura / 2, -altura / 2],
    [largura / 2, altura / 2],
    [-largura / 2, altura / 2],
  ];
  return cantos.every(([px, py]) => {
    // A porcentagem do translate do CSS é sobre o tamanho do próprio elemento.
    const dx = px - x * largura;
    const dy = py - y * altura;
    const qx = (dx * Math.cos(r) - dy * Math.sin(r)) / escala;
    const qy = (dx * Math.sin(r) + dy * Math.cos(r)) / escala;
    // Tolerância de subpixel: a folga real de `escalaSegura` é de 1%.
    return Math.abs(qx) <= largura / 2 + 1e-9 && Math.abs(qy) <= altura / 2 + 1e-9;
  });
}

describe("escalaSegura", () => {
  it("cobre o quadro em qualquer combinação de rotação e deslocamento", () => {
    for (const proporcao of PROPORCOES) {
      for (let graus = -8; graus <= 8; graus += 1) {
        for (let desloc = -0.12; desloc <= 0.12; desloc += 0.02) {
          const escala = escalaSegura(graus, desloc, desloc / 2, proporcao);
          const cobre = cobreOQuadro({ x: desloc, y: desloc / 2, graus, escala }, proporcao);
          expect(cobre, `graus=${graus} desloc=${desloc.toFixed(2)} prop=${proporcao}`).toBe(true);
        }
      }
    }
  });

  it("nunca encolhe a imagem", () => {
    for (const proporcao of PROPORCOES) {
      expect(escalaSegura(0, 0, 0, proporcao)).toBeGreaterThanOrEqual(1);
    }
  });

  it("cresce com o deslocamento", () => {
    const parado = escalaSegura(0, 0, 0, 16 / 9);
    const deslocado = escalaSegura(0, 0.12, 0, 16 / 9);
    expect(deslocado).toBeGreaterThan(parado);
  });
});

describe("estadoAmbiente", () => {
  it("é pura: mesmo instante, mesmo resultado", () => {
    for (const ambient of AMBIENTES) {
      const a = estadoAmbiente(ambient, 7321, 0.4, 0.55, 0.6, 16 / 9);
      const b = estadoAmbiente(ambient, 7321, 0.4, 0.55, 0.6, 16 / 9);
      expect(a).toEqual(b);
    }
  });

  it("nunca descobre a borda da imagem, em nenhum instante", () => {
    for (const proporcao of PROPORCOES) {
      for (const ambient of AMBIENTES) {
        for (let ms = 0; ms <= 60_000; ms += 250) {
          const t = ler(estadoAmbiente(ambient, ms, 1, 1, 1, proporcao).transform);
          expect(cobreOQuadro(t, proporcao), `${ambient} em ${ms}ms`).toBe(true);
        }
      }
    }
  });

  it("percorre uma faixa grande o bastante para ser vista", () => {
    // O defeito de `pitfalls.md` §12 era justamente este: amplitude
    // imperceptível. Em um ciclo completo do modo mais lento (42 s), a soma do
    // movimento precisa ser visível — não basta não estar parado.
    for (const ambient of COM_MOVIMENTO) {
      const amostras = Array.from({ length: 440 }, (_, i) => {
        const t = ler(estadoAmbiente(ambient, i * 100, 0, 1, 0, 16 / 9).transform);
        return t.escala + Math.abs(t.x) + Math.abs(t.y) + Math.abs(t.graus) / 100;
      });
      const faixa = Math.max(...amostras) - Math.min(...amostras);
      expect(faixa, ambient).toBeGreaterThan(0.02);
    }
  });

  it("não salta entre um quadro e o seguinte", () => {
    // `pulse` fica de fora de propósito: ele é o único com ataque seco, e o
    // salto no reinício do batimento é o que o faz soar como percussão em vez
    // de seno mole. Está coberto pelo teste seguinte.
    for (const ambient of AMBIENTES.filter((a) => a !== "pulse")) {
      let anterior = ler(estadoAmbiente(ambient, 0, 0, 1, 0, 16 / 9).transform);
      // Passo de 1/30 s: o salto que o olho pegaria aparece aqui.
      for (let ms = 33; ms <= 60_000; ms += 33) {
        const atual = ler(estadoAmbiente(ambient, ms, 0, 1, 0, 16 / 9).transform);
        expect(Math.abs(atual.escala - anterior.escala), `${ambient} em ${ms}ms`).toBeLessThan(0.01);
        expect(Math.abs(atual.x - anterior.x)).toBeLessThan(0.01);
        expect(Math.abs(atual.y - anterior.y)).toBeLessThan(0.01);
        anterior = atual;
      }
    }
  });

  it("o modo pulse bate uma vez por período, com ataque seco", () => {
    // A subida precisa ser abrupta e a queda lenta — é o que separa "batida"
    // de "respiração rápida". Uma curva simétrica aqui significaria que o modo
    // virou um seno, que foi o defeito que motivou reescrevê-lo.
    const escala = (ms: number) => ler(estadoAmbiente("pulse", ms, 0, 1, 0, 16 / 9).transform).escala;
    const ataque = escala(0) - escala(1999);
    const queda = escala(0) - escala(600);
    expect(ataque).toBeGreaterThan(0.05);
    expect(queda).toBeLessThan(ataque);
  });

  it("a batida chega mesmo com a intensidade no mínimo", () => {
    // "Sem movimento" é sobre a deriva contínua, não sobre ignorar a música.
    const repouso = ler(estadoAmbiente("none", 0, 0, 0, 1, 16 / 9).transform);
    const batendo = ler(estadoAmbiente("none", 0, 1, 0, 1, 16 / 9).transform);
    expect(batendo.escala).toBeGreaterThan(repouso.escala);
  });

  it("a batida some quando a reação está zerada", () => {
    const semReacao = ler(estadoAmbiente("none", 0, 1, 0, 0, 16 / 9).transform);
    const repouso = ler(estadoAmbiente("none", 0, 0, 0, 0, 16 / 9).transform);
    expect(semReacao.escala).toBeCloseTo(repouso.escala, 6);
  });

  it("a batida aumenta a escala, nunca diminui", () => {
    for (const ambient of AMBIENTES) {
      for (let ms = 0; ms <= 30_000; ms += 1000) {
        const parado = ler(estadoAmbiente(ambient, ms, 0, 0.55, 1, 16 / 9).transform);
        const pulsando = ler(estadoAmbiente(ambient, ms, 1, 0.55, 1, 16 / 9).transform);
        expect(pulsando.escala, `${ambient} em ${ms}ms`).toBeGreaterThan(parado.escala);
      }
    }
  });

  it("não descaracteriza a foto: a escala tem teto", () => {
    for (const ambient of AMBIENTES) {
      for (let ms = 0; ms <= 60_000; ms += 250) {
        const t = ler(estadoAmbiente(ambient, ms, 1, 1, 1, 16 / 9).transform);
        expect(t.escala, `${ambient} em ${ms}ms`).toBeLessThanOrEqual(1.8);
      }
    }
  });

  it("o estado parado não transforma nada", () => {
    expect(AMBIENTE_PARADO.transform).toBe("none");
  });
});
