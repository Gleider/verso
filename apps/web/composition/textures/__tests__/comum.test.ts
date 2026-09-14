import { describe, expect, it } from "vitest";
import { hash } from "../comum";

describe("hash", () => {
  it("é determinístico — mesma entrada, mesma saída", () => {
    expect(hash(42)).toBe(hash(42));
  });

  it("fica sempre entre 0 e 1", () => {
    for (let n = 0; n < 200; n += 1) {
      const valor = hash(n * 7.3);
      expect(valor).toBeGreaterThanOrEqual(0);
      expect(valor).toBeLessThan(1);
    }
  });

  it("entradas diferentes tendem a dar saídas diferentes", () => {
    expect(hash(1)).not.toBe(hash(2));
  });
});
