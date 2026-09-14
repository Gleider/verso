"use client";

import { PALETAS } from "@/composition/palettes";
import type { OverlayId, TextureId } from "@/composition/settings";
import type { VideoSettings } from "@/lib/types";
import { BotaoDeGrupo } from "./BotaoDeGrupo";

interface Props {
  settings: VideoSettings;
  onChange: (settings: VideoSettings) => void;
}

const TEXTURAS: { id: TextureId; rotulo: string }[] = [
  { id: "none", rotulo: "Nenhuma" },
  { id: "grain", rotulo: "Granulado" },
  { id: "vhs", rotulo: "VHS" },
  { id: "paper", rotulo: "Papel" },
  { id: "sepia", rotulo: "Sépia" },
  { id: "dust", rotulo: "Poeira" },
  { id: "halftone", rotulo: "Retícula" },
  { id: "vignette", rotulo: "Vinheta" },
];

const OVERLAYS: { id: OverlayId; rotulo: string }[] = [
  { id: "none", rotulo: "Nenhum" },
  { id: "scrim-bottom", rotulo: "Véu inferior" },
  { id: "scrim-full", rotulo: "Véu completo" },
  { id: "vignette", rotulo: "Vinheta" },
];

/** Aba Style: paleta de cores, texturas e véu de legibilidade. */
export function PainelStyle({ settings, onChange }: Props) {
  const { style } = settings;

  function atualizar(parcial: Partial<VideoSettings["style"]>) {
    onChange({ ...settings, style: { ...style, ...parcial } });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          cores
        </span>
        <div className="grid grid-cols-3 gap-2">
          {PALETAS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => atualizar({ palette: p.id })}
              className={`flex flex-col items-center gap-1 border p-2 transition-colors ${
                style.palette === p.id ? "border-amber" : "border-line hover:border-amber"
              }`}
            >
              <span
                className="font-display text-lg font-bold"
                style={{ color: p.sung }}
              >
                a
              </span>
              <span className="font-mono text-[10px] text-ink-3">{p.rotulo}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          texturas
        </span>
        <div className="flex flex-wrap gap-2">
          {TEXTURAS.map((t) => (
            <BotaoDeGrupo key={t.id} ativo={style.texture === t.id} onClick={() => atualizar({ texture: t.id })}>
              {t.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
        {style.texture !== "none" && (
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            intensidade — {Math.round(style.textureIntensity * 100)}%
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={style.textureIntensity}
              onChange={(e) => atualizar({ textureIntensity: Number(e.target.value) })}
            />
          </label>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          véu de legibilidade
        </span>
        <div className="flex flex-wrap gap-2">
          {OVERLAYS.map((o) => (
            <BotaoDeGrupo key={o.id} ativo={style.overlay === o.id} onClick={() => atualizar({ overlay: o.id })}>
              {o.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
      </section>
    </div>
  );
}
