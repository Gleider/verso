"use client";

import type { ReactNode } from "react";

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

/** Percentual de 0 a 1, o formato mais usado nos painéis. */
export const comoPorcento = (v: number) => `${Math.round(v * 100)}%`;
