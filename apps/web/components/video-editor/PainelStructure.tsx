"use client";

import type { LyricsPosition } from "@/composition/settings";
import type { VideoSettings } from "@/lib/types";
import { BotaoDeGrupo } from "./BotaoDeGrupo";

interface Props {
  settings: VideoSettings;
  onChange: (settings: VideoSettings) => void;
}

const POSICOES: { id: LyricsPosition; rotulo: string }[] = [
  { id: "top", rotulo: "Topo" },
  { id: "center", rotulo: "Centro" },
  { id: "bottom", rotulo: "Rodapé" },
];

/**
 * Aba Structure: só a posição da letra na tela.
 *
 * O campo existe mesmo com uma opção só de layout (o pedido explícito) para
 * que acrescentar outros tipos depois não seja mudança de formato.
 */
export function PainelStructure({ settings, onChange }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          posição da letra
        </span>
        <div className="flex flex-wrap gap-2">
          {POSICOES.map((p) => (
            <BotaoDeGrupo
              key={p.id}
              ativo={settings.structure.lyricsPosition === p.id}
              onClick={() =>
                onChange({ ...settings, structure: { lyricsPosition: p.id } })
              }
            >
              {p.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
      </section>
    </div>
  );
}
