import { describe, expect, it } from "vitest";
import { hash } from "../aleatorio";

describe("hash", () => {
  it("é determinístico — mesma entrada, mesma saída", () => {
    expect(hash(42)).toBe(hash(42));
    expect(hash(0.5)).toBe(hash(0.5));
  });

  it("fica sempre entre 0 e 1", () => {
    for (let n = -50; n < 50; n += 0.7) {
      const v = hash(n);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("entradas vizinhas dão valores bem diferentes — é isso que faz ruído", () => {
    // Sem dispersão entre vizinhos, o "chiado" viraria uma rampa suave.
    const diferencas = [1, 2, 3, 4, 5].map((n) => Math.abs(hash(n) - hash(n + 1)));
    const media = diferencas.reduce((a, b) => a + b, 0) / diferencas.length;
    expect(media).toBeGreaterThan(0.15);
  });
});
