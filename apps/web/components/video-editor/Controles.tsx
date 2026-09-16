"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { formatarTimecode, parseTimecode } from "@/lib/rascunho";

/** Título de seção — o mesmo rótulo mono em caixa alta de toda aba do editor. */
export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">{titulo}</span>
      {children}
    </section>
  );
}

/**
 * Controle contínuo com o valor sempre à vista.
 *
 * `formatar` existe porque o número cru raramente é o que ajuda: 0.62 não diz
 * nada, "62%" diz.
 */
export function Deslizador({
  rotulo,
  valor,
  min,
  max,
  step,
  onChange,
  formatar = (v) => String(v),
  desabilitado = false,
  dica,
}: {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  step: number;
  onChange: (valor: number) => void;
  formatar?: (valor: number) => string;
  desabilitado?: boolean;
  dica?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 text-xs ${desabilitado ? "opacity-40" : "text-ink-2"}`}>
      <span className="flex items-baseline justify-between gap-2">
        <span>{rotulo}</span>
        <span className="font-mono text-[11px] text-ink-3">{formatar(valor)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={valor}
        disabled={desabilitado}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-amber"
      />
      {dica && <span className="text-[11px] text-ink-3">{dica}</span>}
    </label>
  );
}

/** Liga/desliga com rótulo à direita. */
export function Interruptor({
  rotulo,
  ligado,
  onChange,
  dica,
}: {
  rotulo: string;
  ligado: boolean;
  onChange: (ligado: boolean) => void;
  dica?: string;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-xs text-ink-2">
      <span className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={ligado}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-amber"
        />
        {rotulo}
      </span>
      {dica && <span className="pl-6 text-[11px] text-ink-3">{dica}</span>}
    </label>
  );
}

/**
 * `<input type="color">` só aceita `#rrggbb`.
 *
 * As paletas guardam `rgba(...)` porque o texto por cantar tem transparência;
 * passar isso direto para o input o deixa preto, e o usuário via a cor errada
 * no seletor antes mesmo de mexer nele.
 */
export function corSolida(valor: string): string {
  if (valor.startsWith("#")) return valor.slice(0, 7);
  const n = valor.match(/[\d.]+/g);
  if (!n || n.length < 3) return "#ffffff";
  const hex = (v: string) => Math.round(Number(v)).toString(16).padStart(2, "0");
  return `#${hex(n[0])}${hex(n[1])}${hex(n[2])}`;
}

/** Percentual de 0 a 1, o formato mais usado nos painéis. */
export const comoPorcento = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Campo de tempo em `mm:ss.cc`.
 *
 * Só comita no blur e no Enter: comitar a cada tecla faria "1:2" virar 1 min 2 s
 * no meio de quem estava digitando "1:23", e o valor saltaria embaixo do dedo.
 */
export function CampoDeTempo({
  rotulo,
  valorMs,
  onChange,
  onUsarTempoAtual,
}: {
  rotulo: string;
  valorMs: number;
  onChange: (ms: number) => void;
  onUsarTempoAtual?: () => void;
}) {
  const [rascunho, setRascunho] = useState<string | null>(null);

  function comitar() {
    if (rascunho === null) return;
    const ms = parseTimecode(rascunho);
    setRascunho(null);
    if (ms !== null) onChange(ms);
  }

  return (
    <label className="flex items-center gap-2 text-xs text-ink-2">
      <span className="w-14 shrink-0">{rotulo}</span>
      <input
        value={rascunho ?? formatarTimecode(valorMs)}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={comitar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            comitar();
          }
          if (e.key === "Escape") setRascunho(null);
        }}
        inputMode="numeric"
        className="w-[84px] border border-line bg-ground px-2 py-1 font-mono text-[11px] tabular-nums text-ink focus:border-amber focus:outline-none"
      />
      {onUsarTempoAtual && (
        <button
          type="button"
          onClick={onUsarTempoAtual}
          title="usar o instante em que o preview está"
          className="font-mono text-[10px] text-ink-3 hover:text-amber"
        >
          aqui
        </button>
      )}
    </label>
  );
}
