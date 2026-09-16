/**
 * O rascunho da letra: o que o editor manipula antes de virar uma versão.
 *
 * Duas regras do domínio moram aqui, e as duas falham calado se alguém as
 * desfizer (ver `.claude/rules/domain.md`):
 *
 * 1. **O tempo que a tela mostra é o efetivo** — `medido + nudge − offset`,
 *    exatamente a conta que `composition/versos.ts` faz para desenhar o vídeo.
 *    Mostrar o medido cru faz o editor discordar do player em toda faixa que
 *    tenha algum ajuste, e ninguém percebe pelo código.
 * 2. **Mudar o tempo de um verso que já existe nunca sobrescreve o medido.**
 *    Vira `nudge_ms`, que é reversível e deixa o dado do modelo intacto para o
 *    alinhamento forçado da fase 2. Só um ponto de legenda NOVO grava tempo
 *    direto — ali não há nada medido para preservar.
 */

import type { LyricLine, WordTiming } from "./types";

/** O máximo que a API aceita em `nudge_ms` (schema `LineNudge`). */
export const LIMITE_NUDGE_MS = 30_000;

export interface VersoRascunho {
  /** Chave estável para o React; o id do banco, ou uma chave local do verso novo. */
  chave: string;
  /** `null` enquanto o verso não existir no banco. */
  id: string | null;
  texto: string;
  /** Tempo como a pessoa vê: medido + nudge − offset. `null` = verso sem timing. */
  tempoMs: number | null;
  /** O que o modelo mediu, sem ajuste nenhum. */
  medidoMs: number | null;
  nudgeMs: number;
  /** O tempo foi escrito à mão, não medido — a API precisa recebê-lo fixado. */
  fixado: boolean;
  abreEstrofe: boolean;
  revisado: boolean;
  precisaRealinhar: boolean;
  palavras: WordTiming[];
}

/** O que salvar: uma versão nova, um ajuste de tempo in-place, ou nada. */
export type Salvamento = "versao" | "tempo" | null;

let contador = 0;

export function paraRascunho(lines: LyricLine[], offsetMs: number): VersoRascunho[] {
  return lines.map((line) => ({
    chave: line.id,
    id: line.id,
    texto: line.text,
    tempoMs: line.start_ms === null ? null : line.start_ms + (line.nudge_ms ?? 0) - offsetMs,
    medidoMs: line.start_ms,
    nudgeMs: line.nudge_ms ?? 0,
    fixado: false,
    abreEstrofe: line.starts_stanza,
    revisado: line.reviewed,
    precisaRealinhar: line.needs_realign,
    palavras: line.words,
  }));
}

/** Um ponto de legenda novo, no tempo pedido. */
export function versoNovo(tempoMs: number, offsetMs: number, texto = ""): VersoRascunho {
  contador += 1;
  const alvo = Math.max(0, Math.round(tempoMs));
  return {
    chave: `novo-${contador}`,
    id: null,
    texto,
    tempoMs: alvo,
    // O tempo guardado é o do áudio; o offset volta a ser descontado na exibição.
    medidoMs: alvo + offsetMs,
    nudgeMs: 0,
    fixado: true,
    abreEstrofe: false,
    revisado: true, // escrito à mão: não há incerteza de modelo para marcar
    precisaRealinhar: true,
    palavras: [],
  };
}

/**
 * Move um verso para `tempoMs`.
 *
 * Verso que o modelo mediu anda pelo `nudge`; verso novo (ou que nunca teve
 * timing) grava o tempo direto, porque não há medida para preservar.
 */
export function comTempo(verso: VersoRascunho, tempoMs: number, offsetMs: number): VersoRascunho {
  const alvo = Math.max(0, Math.round(tempoMs));

  if (verso.id === null || verso.medidoMs === null) {
    return { ...verso, medidoMs: alvo + offsetMs, nudgeMs: 0, tempoMs: alvo, fixado: true };
  }

  const desejado = alvo + offsetMs - verso.medidoMs;
  const nudgeMs = Math.max(-LIMITE_NUDGE_MS, Math.min(LIMITE_NUDGE_MS, Math.round(desejado)));
  return { ...verso, nudgeMs, tempoMs: verso.medidoMs + nudgeMs - offsetMs };
}

/** `true` quando o tempo pedido está além do que o ajuste por verso alcança. */
export function foraDoAlcance(
  verso: VersoRascunho,
  tempoMs: number,
  offsetMs: number,
): boolean {
  if (verso.id === null || verso.medidoMs === null) return false;
  return Math.abs(Math.max(0, tempoMs) + offsetMs - verso.medidoMs) > LIMITE_NUDGE_MS;
}

/**
 * O que este rascunho exige do servidor.
 *
 * Versionar é sobre **o que a letra diz**: mexer só no tempo grava in-place,
 * como o offset e o nudge do player. Mexer no texto, na estrutura ou fixar um
 * tempo à mão cria versão — e o tempo vai junto nela.
 */
export function oQueSalvar(atuais: VersoRascunho[], originais: VersoRascunho[]): Salvamento {
  if (atuais.length !== originais.length) return "versao";

  for (let indice = 0; indice < atuais.length; indice += 1) {
    const atual = atuais[indice];
    const original = originais[indice];
    if (
      atual.chave !== original.chave ||
      atual.texto !== original.texto ||
      atual.abreEstrofe !== original.abreEstrofe ||
      atual.revisado !== original.revisado ||
      atual.fixado !== original.fixado ||
      atual.medidoMs !== original.medidoMs
    ) {
      return "versao";
    }
  }

  return atuais.some((atual, indice) => atual.nudgeMs !== originais[indice].nudgeMs)
    ? "tempo"
    : null;
}

export function formatarTimecode(ms: number | null): string {
  if (ms === null || ms === undefined) return "--:--.--";
  const minutos = Math.floor(ms / 60_000);
  const segundos = Math.floor((ms % 60_000) / 1000);
  const centesimos = Math.floor((ms % 1000) / 10);
  return `${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}.${String(
    centesimos,
  ).padStart(2, "0")}`;
}

/** Lê `mm:ss.cc`, `mm:ss` ou segundos soltos. Devolve `null` se não for tempo. */
export function parseTimecode(texto: string): number | null {
  const limpo = texto.trim().replace(",", ".");
  if (!limpo) return null;

  const casado = /^(?:(\d+):)?([0-5]?\d)(?:\.(\d{1,3}))?$/.exec(limpo);
  if (!casado) return null;

  const [, minutos, segundos, fracao] = casado;
  const milis = fracao ? Number(fracao.padEnd(3, "0")) : 0;
  return Number(minutos ?? 0) * 60_000 + Number(segundos) * 1000 + milis;
}
