"use client";

import type { ReactNode } from "react";

/**
 * Botão de seleção dentro de um grupo — o mesmo estilo em toda aba do editor.
 *
 * `dica` vira `title`: os rótulos aqui são curtos por necessidade de espaço
 * ("Tubo", "Recorte", "Varredura") e sozinhos não dizem o que o controle faz.
 */
export function BotaoDeGrupo({
  ativo,
  onClick,
  children,
  dica,
  desabilitado = false,
}: {
  ativo: boolean;
  onClick: () => void;
  children: ReactNode;
  dica?: string;
  desabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={dica}
      disabled={desabilitado}
      aria-pressed={ativo}
      className={`border px-3 py-1.5 font-mono text-xs transition-colors ${
        desabilitado
          ? "cursor-not-allowed border-line-soft text-ink-3 opacity-40"
          : ativo
            ? "border-amber text-amber"
            : "border-line text-ink-2 hover:border-amber hover:text-amber"
      }`}
    >
      {children}
    </button>
  );
}
