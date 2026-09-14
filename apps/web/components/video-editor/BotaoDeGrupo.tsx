"use client";

import type { ReactNode } from "react";

/** Botão de seleção dentro de um grupo — o mesmo estilo em toda aba do editor. */
export function BotaoDeGrupo({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-3 py-1.5 font-mono text-xs transition-colors ${
        ativo
          ? "border-amber text-amber"
          : "border-line text-ink-2 hover:border-amber hover:text-amber"
      }`}
    >
      {children}
    </button>
  );
}
