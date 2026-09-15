import { describe, expect, it } from "vitest";
import type { MediaUtilsAudioData } from "@remotion/media-utils";
import { construirAnalise, N_BANDAS } from "../envelope";

const SAMPLE_RATE = 16_000;
const FPS = 30;

/**
 * Áudio sintético: piso de ruído contínuo (como toda gravação real — nunca
 * silêncio digital puro) e uma rajada de grave isolada em 2000–2050ms.
 *
 * O piso de ruído importa: `stepBeat` trata `average === 0` como "sem
 * referência ainda" e trava a média no valor da própria rajada nesse caso —
 * o mesmo tratamento do quadro 0. Silêncio digital puro faria a média cair a
 * exatamente 0 e a rajada nunca contaria como batida, o que não reproduz uma
 * gravação real (confirmado depurando este teste antes de escrevê-lo).
 *
 * `resultId` PRECISA ser único por chamada: `getMaxPossibleMagnitude` (dentro
 * de `visualizeAudio`) cacheia a amplitude máxima por `resultId`, num objeto
 * de módulo que sobrevive entre testes. Dois áudios sintéticos diferentes
 * reaproveitando o mesmo `resultId` fariam o segundo herdar a normalização do
 * primeiro — foi exatamente isso que zerou o pulso da rajada aqui até este
 * comentário existir. Em produção não há risco: `getAudioData` gera um
 * `resultId` genuinamente único por arquivo decodificado.
 */
let contadorDeFixture = 0;

function audioComUmaRajada(duracaoMs: number): MediaUtilsAudioData {
  contadorDeFixture += 1;
  const totalAmostras = Math.round((duracaoMs / 1000) * SAMPLE_RATE);
  const canal = new Float32Array(totalAmostras);

  for (let i = 0; i < totalAmostras; i += 1) {
    const tMs = (i / SAMPLE_RATE) * 1000;
    canal[i] = Math.sin((2 * Math.PI * 90 * i) / SAMPLE_RATE) * 0.02;
    if (tMs >= 2000 && tMs < 2050) {
      canal[i] += Math.sin((2 * Math.PI * 100 * i) / SAMPLE_RATE) * 0.9;
    }
  }

  return {
    channelWaveforms: [canal],
    sampleRate: SAMPLE_RATE,
    durationInSeconds: duracaoMs / 1000,
    numberOfChannels: 1,
    resultId: `sintetico-${contadorDeFixture}`,
    isRemote: false,
  };
}

describe("construirAnalise", () => {
  it("produz um Float32Array com um valor por quadro", () => {
    const dados = audioComUmaRajada(1000);
    const { pulso: envelope } = construirAnalise(dados, FPS, 1000);

    expect(envelope).toBeInstanceOf(Float32Array);
    expect(envelope.length).toBe(30);
  });

  it("é determinístico — mesma entrada, mesmo envelope, sempre", () => {
    const dados = audioComUmaRajada(3000);

    const { pulso: primeiro } = construirAnalise(dados, FPS, 3000);
    const { pulso: segundo } = construirAnalise(dados, FPS, 3000);

    expect(Array.from(segundo)).toEqual(Array.from(primeiro));
  });

  it("dispara o pulso quando a rajada chega, depois de o piso se estabilizar", () => {
    const dados = audioComUmaRajada(4000);
    const { pulso: envelope } = construirAnalise(dados, FPS, 4000);

    // A rajada começa em 2000ms = quadro 60. O piso de ruído já está estável
    // bem antes disso (quadro 30) e ainda não disparou nada.
    const quadroEstavel = Math.round((1000 / 1000) * FPS);
    const quadroDaRajada = Math.round((2000 / 1000) * FPS);

    expect(envelope[quadroEstavel]).toBe(0);
    expect(envelope[quadroDaRajada]).toBeGreaterThan(0);
  });

  it("o pulso decai depois da rajada — não fica ligado para sempre", () => {
    const dados = audioComUmaRajada(4000);
    const { pulso: envelope } = construirAnalise(dados, FPS, 4000);

    const noAtaque = envelope[60];
    const dezQuadrosDepois = envelope[70];

    expect(dezQuadrosDepois).toBeLessThan(noAtaque);
  });

  it("nunca sai da faixa 0..1 — é o que os modos de movimento assumem", () => {
    const dados = audioComUmaRajada(3000);
    const { pulso: envelope } = construirAnalise(dados, FPS, 3000);

    for (const valor of envelope) {
      expect(valor).toBeGreaterThanOrEqual(0);
      expect(valor).toBeLessThanOrEqual(1);
    }
  });
});
