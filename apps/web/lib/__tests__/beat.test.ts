/**
 * Detecção de batida e movimento ambiente da imagem de fundo.
 *
 * A regra que guia tudo aqui: o efeito precisa dar sensação de vida sem
 * chamar atenção para si. Amplitudes são pequenas de propósito.
 */
import { describe, expect, it } from "vitest";
import { INITIAL_BEAT, ambientDrift, ambientScale, stepBeat, visualState } from "../beat";

describe("stepBeat", () => {
  it("começa sem pulso e sem histórico", () => {
    expect(INITIAL_BEAT.pulse).toBe(0);
    expect(INITIAL_BEAT.average).toBe(0);
  });

  it("dispara o pulso quando a energia salta acima da média", () => {
    let state = INITIAL_BEAT;
    // Regime estável de energia baixa.
    for (let i = 0; i < 40; i += 1) state = stepBeat(state, 0.2);
    expect(state.pulse).toBeLessThan(0.2);

    // Uma pancada de grave.
    state = stepBeat(state, 0.9);
    expect(state.pulse).toBeGreaterThan(0.8);
  });

  it("não dispara com energia constante, por mais alta que seja", () => {
    let state = INITIAL_BEAT;
    for (let i = 0; i < 60; i += 1) state = stepBeat(state, 0.85);
    // Um trecho contínuo e alto não é batida: é volume.
    expect(state.pulse).toBeLessThan(0.35);
  });

  it("ignora ruído no silêncio", () => {
    let state = INITIAL_BEAT;
    for (let i = 0; i < 40; i += 1) state = stepBeat(state, 0.001);
    state = stepBeat(state, 0.02); // relativamente alto, mas inaudível
    expect(state.pulse).toBe(0);
  });

  it("o pulso decai sozinho depois da batida", () => {
    let state = INITIAL_BEAT;
    for (let i = 0; i < 40; i += 1) state = stepBeat(state, 0.2);
    state = stepBeat(state, 0.9);
    const pico = state.pulse;

    for (let i = 0; i < 12; i += 1) state = stepBeat(state, 0.2);
    expect(state.pulse).toBeLessThan(pico * 0.5);
  });

  it("mantém o pulso dentro de 0 e 1", () => {
    let state = INITIAL_BEAT;
    for (let i = 0; i < 200; i += 1) {
      state = stepBeat(state, Math.random());
      expect(state.pulse).toBeGreaterThanOrEqual(0);
      expect(state.pulse).toBeLessThanOrEqual(1);
    }
  });
});

describe("ambientScale", () => {
  it("nunca desce abaixo da margem que o deslocamento precisa", () => {
    // Com zoom 1.0 o deslocamento lateral revelaria a borda da imagem.
    for (let t = 0; t <= 120_000; t += 250) {
      expect(ambientScale(t)).toBeGreaterThanOrEqual(1.04);
    }
  });

  it("respira devagar, sem nunca saltar", () => {
    let anterior = ambientScale(0);
    for (let t = 100; t <= 60_000; t += 100) {
      const atual = ambientScale(t);
      // Em 100ms a escala pode crescer, mas nunca a ponto de o olho ver um salto.
      expect(Math.abs(atual - anterior)).toBeLessThan(0.004);
      anterior = atual;
    }
  });

  it("fica dentro de um limite que não distorce a imagem", () => {
    for (let t = 0; t <= 120_000; t += 250) {
      expect(ambientScale(t)).toBeLessThanOrEqual(1.2);
    }
  });

  it("percorre uma faixa grande o bastante para ser vista", () => {
    // O defeito anterior era justamente este: amplitude imperceptível.
    const amostras = Array.from({ length: 400 }, (_, i) => ambientScale(i * 100));
    expect(Math.max(...amostras) - Math.min(...amostras)).toBeGreaterThan(0.08);
  });
});

describe("ambientDrift", () => {
  it("começa centralizado", () => {
    expect(ambientDrift(0)).toEqual({ x: 0, y: 0 });
  });

  it("fica dentro da margem que o zoom oferece", () => {
    for (let t = 0; t <= 180_000; t += 250) {
      const { x, y } = ambientDrift(t);
      expect(Math.abs(x)).toBeLessThanOrEqual(2);
      expect(Math.abs(y)).toBeLessThanOrEqual(1.5);
    }
  });

  it("os dois eixos não andam juntos", () => {
    // Períodos iguais dariam um movimento em diagonal, que denuncia o truque.
    const iguais = Array.from({ length: 200 }, (_, i) => {
      const { x, y } = ambientDrift(i * 250);
      return Math.abs(x - y) < 0.01;
    });
    expect(iguais.filter(Boolean).length).toBeLessThan(40);
  });
});

describe("visualState", () => {
  it("sem pulso, não altera cor nenhuma", () => {
    const estado = visualState(0, 0);
    expect(estado.brightness).toBeCloseTo(1, 3);
    expect(estado.saturate).toBeCloseTo(1, 3);
  });

  it("a batida é visível sem descaracterizar a foto", () => {
    const estado = visualState(0, 1);
    // Precisa ser percebido; não pode virar outra imagem.
    expect(estado.brightness).toBeGreaterThan(1.1);
    expect(estado.brightness).toBeLessThanOrEqual(1.25);
    expect(estado.saturate).toBeLessThanOrEqual(1.3);
    expect(estado.scale - visualState(0, 0).scale).toBeGreaterThan(0.02);
  });

  it("a batida sempre aumenta a escala em relação ao repouso", () => {
    expect(visualState(5000, 1).scale).toBeGreaterThan(visualState(5000, 0).scale);
  });
});
