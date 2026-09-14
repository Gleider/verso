"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import type { AspectRatio, Resolucao } from "@/composition/settings";
import type { VideoSettings } from "@/lib/types";
import { BotaoDeGrupo } from "./BotaoDeGrupo";

const AMBIENTES: { id: VideoSettings["background"]["ambient"]; rotulo: string }[] = [
  { id: "breathe", rotulo: "Respiração" },
  { id: "pulse", rotulo: "Pulso" },
  { id: "drift", rotulo: "Deriva" },
  { id: "none", rotulo: "Nenhum" },
];

const PROPORCOES: { id: AspectRatio; rotulo: string }[] = [
  { id: "16:9", rotulo: "16:9 · paisagem" },
  { id: "9:16", rotulo: "9:16 · retrato" },
];

const RESOLUCOES: { id: Resolucao; rotulo: string }[] = [
  { id: "720p", rotulo: "720p" },
  { id: "1080p", rotulo: "1080p" },
];

interface Props {
  trackId: string;
  settings: VideoSettings;
  hasBackground: boolean;
  onChange: (settings: VideoSettings) => void;
  onBackgroundUploaded: () => void;
}

/** Aba Background: origem da imagem, movimento ambiente e legibilidade do texto. */
export function PainelBackground({
  trackId,
  settings,
  hasBackground,
  onChange,
  onBackgroundUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { background } = settings;

  function atualizar(parcial: Partial<VideoSettings["background"]>) {
    onChange({ ...settings, background: { ...background, ...parcial } });
  }

  async function enviarArquivo(file: File) {
    setEnviando(true);
    setErro(null);
    try {
      await api.setBackground(trackId, file);
      atualizar({ kind: "upload" });
      onBackgroundUploaded();
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : "Não foi possível enviar a imagem.");
    } finally {
      setEnviando(false);
    }
  }

  function atualizarSaida(parcial: Partial<VideoSettings["output"]>) {
    onChange({ ...settings, output: { ...settings.output, ...parcial } });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          formato
        </span>
        <div className="flex flex-wrap gap-2">
          {PROPORCOES.map((p) => (
            <BotaoDeGrupo
              key={p.id}
              ativo={settings.output.aspectRatio === p.id}
              onClick={() => atualizarSaida({ aspectRatio: p.id })}
            >
              {p.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {RESOLUCOES.map((r) => (
            <BotaoDeGrupo
              key={r.id}
              ativo={settings.output.resolution === r.id}
              onClick={() => atualizarSaida({ resolution: r.id })}
            >
              {r.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          origem
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
            className="border border-line px-3 py-1.5 font-mono text-xs text-ink-2 transition-colors hover:border-amber hover:text-amber disabled:opacity-40"
          >
            {enviando ? "enviando…" : hasBackground ? "trocar envio" : "enviar imagem"}
          </button>
          <button
            type="button"
            onClick={() => atualizar({ kind: "color" })}
            className={`border px-3 py-1.5 font-mono text-xs transition-colors ${
              background.kind === "color"
                ? "border-amber text-amber"
                : "border-line text-ink-2 hover:border-amber hover:text-amber"
            }`}
          >
            sem imagem (cor sólida)
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void enviarArquivo(file);
            e.target.value = "";
          }}
        />
        {background.kind === "color" && (
          <input
            type="color"
            value={background.color}
            onChange={(e) => atualizar({ color: e.target.value })}
            className="h-9 w-16 border border-line bg-surface"
          />
        )}
        {erro && (
          <p role="alert" className="text-sm text-risk">
            {erro}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          movimento ambiente
        </span>
        <div className="flex flex-wrap gap-2">
          {AMBIENTES.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => atualizar({ ambient: a.id })}
              className={`border px-3 py-1.5 font-mono text-xs transition-colors ${
                background.ambient === a.id
                  ? "border-amber text-amber"
                  : "border-line text-ink-2 hover:border-amber hover:text-amber"
              }`}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          intensidade — {Math.round(background.ambientIntensity * 100)}%
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={background.ambientIntensity}
            onChange={(e) => atualizar({ ambientIntensity: Number(e.target.value) })}
          />
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          legibilidade
        </span>
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          desfoque — {background.blur}px
          <input
            type="range"
            min={0}
            max={40}
            step={1}
            value={background.blur}
            onChange={(e) => atualizar({ blur: Number(e.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          escurecimento — {Math.round(background.darken * 100)}%
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={background.darken}
            onChange={(e) => atualizar({ darken: Number(e.target.value) })}
          />
        </label>
      </section>
    </div>
  );
}
