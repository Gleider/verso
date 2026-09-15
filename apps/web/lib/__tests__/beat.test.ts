/**
 * Detecção de batida.
 *
 * O que importa aqui é a distinção que dá nome ao módulo: batida é energia
 * acima do habitual, não energia alta.
 *
 * O movimento ambiente da imagem era testado neste arquivo até o editor de
 * vídeo; as garantias dele (amplitude visível, sem salto entre quadros)
 * migraram para `composition/__tests__/ambiente.test.ts`, junto com o código.
 */
import { describe, expect, it } from "vitest";
import { INITIAL_BEAT, stepBeat } from "../beat";

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
