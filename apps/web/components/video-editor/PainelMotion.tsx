"use client";

import { MODOS } from "@/composition/motion";
import type { SyncId, TweakId } from "@/composition/settings";
import type { VideoSettings } from "@/lib/types";
import { BotaoDeGrupo } from "./BotaoDeGrupo";

interface Props {
  settings: VideoSettings;
  onChange: (settings: VideoSettings) => void;
}

const TWEAKS: { id: TweakId; rotulo: string }[] = [
  { id: "none", rotulo: "Nenhum" },
  { id: "floating", rotulo: "Flutuante" },
];

const SINCRONIAS: { id: SyncId; rotulo: string }[] = [
  { id: "line", rotulo: "Linha" },
  { id: "word", rotulo: "Palavra" },
  { id: "syllable", rotulo: "Sílaba" },
];

/** Aba Motion: como o texto entra, sai e reage à batida. */
export function PainelMotion({ settings, onChange }: Props) {
  const { motion } = settings;

  function atualizar(parcial: Partial<VideoSettings["motion"]>) {
    onChange({ ...settings, motion: { ...motion, ...parcial } });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          animação
        </span>
        <div className="grid grid-cols-2 gap-2">
          {Object.values(MODOS).map((modo) => (
            <BotaoDeGrupo
              key={modo.id}
              ativo={motion.animation === modo.id}
              onClick={() => atualizar({ animation: modo.id })}
            >
              {modo.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          duração da entrada — {motion.durationMs}ms
          <input
            type="range"
            min={0}
            max={1200}
            step={20}
            value={motion.durationMs}
            onChange={(e) => atualizar({ durationMs: Number(e.target.value) })}
          />
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          ajuste contínuo
        </span>
        <div className="flex flex-wrap gap-2">
          {TWEAKS.map((t) => (
            <BotaoDeGrupo key={t.id} ativo={motion.tweak === t.id} onClick={() => atualizar({ tweak: t.id })}>
              {t.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          sincronia
        </span>
        <div className="flex flex-wrap gap-2">
          {SINCRONIAS.map((s) => (
            <BotaoDeGrupo key={s.id} ativo={motion.sync === s.id} onClick={() => atualizar({ sync: s.id })}>
              {s.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
      </section>
    </div>
  );
}
