"use client";

import { FONTES } from "@/composition/fonts";
import type { AlignH, AlignV, FontSize } from "@/composition/settings";
import type { VideoSettings } from "@/lib/types";
import { BotaoDeGrupo } from "./BotaoDeGrupo";

interface Props {
  settings: VideoSettings;
  onChange: (settings: VideoSettings) => void;
}

const TAMANHOS: { id: FontSize; rotulo: string }[] = [
  { id: "small", rotulo: "Pequena" },
  { id: "medium", rotulo: "Média" },
  { id: "large", rotulo: "Grande" },
];

const ALINHOS_H: { id: AlignH; rotulo: string }[] = [
  { id: "left", rotulo: "Esquerda" },
  { id: "center", rotulo: "Centro" },
  { id: "right", rotulo: "Direita" },
  { id: "justify", rotulo: "Justificado" },
];

const ALINHOS_V: { id: AlignV; rotulo: string }[] = [
  { id: "top", rotulo: "Topo" },
  { id: "middle", rotulo: "Meio" },
  { id: "bottom", rotulo: "Base" },
];

/** Aba Font: família, tamanho e alinhamento da letra. */
export function PainelFont({ settings, onChange }: Props) {
  const { font } = settings;

  function atualizar(parcial: Partial<VideoSettings["font"]>) {
    onChange({ ...settings, font: { ...font, ...parcial } });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          família
        </span>
        <div className="grid grid-cols-2 gap-2">
          {FONTES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => atualizar({ family: f.id })}
              style={{ fontFamily: f.family }}
              className={`border px-3 py-3 text-lg transition-colors ${
                font.family === f.id
                  ? "border-amber text-amber"
                  : "border-line text-ink-2 hover:border-amber hover:text-amber"
              }`}
            >
              Aa
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          tamanho
        </span>
        <div className="flex flex-wrap gap-2">
          {TAMANHOS.map((t) => (
            <BotaoDeGrupo key={t.id} ativo={font.size === t.id} onClick={() => atualizar({ size: t.id })}>
              {t.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          peso — {font.weight}
          <input
            type="range"
            min={400}
            max={900}
            step={100}
            value={font.weight}
            onChange={(e) => atualizar({ weight: Number(e.target.value) })}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <input
            type="checkbox"
            checked={font.uppercase}
            onChange={(e) => atualizar({ uppercase: e.target.checked })}
          />
          caixa alta
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          alinhar horizontal
        </span>
        <div className="flex flex-wrap gap-2">
          {ALINHOS_H.map((a) => (
            <BotaoDeGrupo key={a.id} ativo={font.alignH === a.id} onClick={() => atualizar({ alignH: a.id })}>
              {a.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          alinhar vertical
        </span>
        <div className="flex flex-wrap gap-2">
          {ALINHOS_V.map((a) => (
            <BotaoDeGrupo key={a.id} ativo={font.alignV === a.id} onClick={() => atualizar({ alignV: a.id })}>
              {a.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
      </section>
    </div>
  );
}
