"use client";

import { useRef, useState } from "react";
import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { BIBLIOTECA } from "@/composition/efeitos/fundos";
import { api } from "@/lib/api";
import type { AmbientId, AspectRatio, Resolucao } from "@/composition/settings";
import type { VideoSettings } from "@/lib/types";
import { BotaoDeGrupo } from "./BotaoDeGrupo";
import { comoPorcento, Deslizador, Secao } from "./Controles";

const AMBIENTES: { id: AmbientId; rotulo: string; dica: string }[] = [
  { id: "breathe", rotulo: "Respiração", dica: "escala lenta com deriva suave" },
  { id: "pulse", rotulo: "Pulso", dica: "a imagem bate junto com o grave" },
  { id: "drift", rotulo: "Deriva", dica: "panorâmica larga atravessando o quadro" },
  { id: "sway", rotulo: "Balanço", dica: "rotação lenta, como câmera na mão" },
  { id: "zoom", rotulo: "Zoom", dica: "aproxima e afasta num ciclo longo" },
  { id: "none", rotulo: "Nenhum", dica: "parado — só a batida ainda empurra" },
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

/** Aba Background: origem da imagem, movimento, gradação de cor e legibilidade. */
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
  const dicaDoAmbiente = AMBIENTES.find((a) => a.id === background.ambient)?.dica;

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
      <Secao titulo="formato">
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
      </Secao>

      <Secao titulo="origem">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
            title="Envia uma imagem sua para o fundo do vídeo (até 40 MB)"
            className="flex items-center gap-1.5 border border-line px-3 py-1.5 font-mono text-xs text-ink-2 transition-colors hover:border-amber hover:text-amber disabled:opacity-40"
          >
            <ArrowUpTrayIcon className="h-4 w-4" aria-hidden="true" />
            {enviando ? "enviando…" : hasBackground ? "trocar imagem" : "carregar imagem"}
          </button>
          <BotaoDeGrupo ativo={background.kind === "color"} onClick={() => atualizar({ kind: "color" })}>
            cor sólida
          </BotaoDeGrupo>
          <BotaoDeGrupo
            ativo={background.kind === "library"}
            onClick={() => atualizar({ kind: "library", ref: background.ref ?? BIBLIOTECA[0].id })}
          >
            biblioteca
          </BotaoDeGrupo>
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
        {background.kind === "library" && (
          <div className="grid grid-cols-4 gap-2">
            {BIBLIOTECA.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => atualizar({ ref: f.id })}
                title={f.rotulo}
                className={`flex flex-col gap-1 border p-1 transition-colors ${
                  background.ref === f.id ? "border-amber" : "border-line hover:border-amber"
                }`}
              >
                <span
                  className="block h-10 w-full"
                  style={{ background: f.amostra, backgroundColor: f.base }}
                />
                <span className="font-mono text-[10px] text-ink-3">{f.rotulo}</span>
              </button>
            ))}
          </div>
        )}
        {erro && (
          <p role="alert" className="text-sm text-risk">
            {erro}
          </p>
        )}
      </Secao>

      <Secao titulo="movimento">
        <div className="flex flex-wrap gap-2">
          {AMBIENTES.map((a) => (
            <BotaoDeGrupo
              key={a.id}
              ativo={background.ambient === a.id}
              onClick={() => atualizar({ ambient: a.id })}
              dica={a.dica}
            >
              {a.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
        {dicaDoAmbiente && <span className="text-[11px] text-ink-3">{dicaDoAmbiente}</span>}
        <Deslizador
          rotulo="intensidade do movimento"
          valor={background.ambientIntensity}
          min={0}
          max={1}
          step={0.01}
          onChange={(ambientIntensity) => atualizar({ ambientIntensity })}
          formatar={comoPorcento}
        />
        <Deslizador
          rotulo="reação à batida"
          valor={background.reacaoBatida}
          min={0}
          max={1}
          step={0.01}
          onChange={(reacaoBatida) => atualizar({ reacaoBatida })}
          formatar={comoPorcento}
          dica="Quanto o grave da música empurra a imagem."
        />
      </Secao>

      <Secao titulo="cor">
        <Deslizador
          rotulo="saturação"
          valor={background.saturacao}
          min={0}
          max={2.5}
          step={0.05}
          onChange={(saturacao) => atualizar({ saturacao })}
          formatar={comoPorcento}
        />
        <Deslizador
          rotulo="contraste"
          valor={background.contraste}
          min={0.4}
          max={2.2}
          step={0.05}
          onChange={(contraste) => atualizar({ contraste })}
          formatar={comoPorcento}
        />
        <Deslizador
          rotulo="brilho"
          valor={background.brilho}
          min={0.3}
          max={2}
          step={0.05}
          onChange={(brilho) => atualizar({ brilho })}
          formatar={comoPorcento}
        />
        <Deslizador
          rotulo="matiz"
          valor={background.matiz}
          min={-180}
          max={180}
          step={1}
          onChange={(matiz) => atualizar({ matiz })}
          formatar={(v) => `${Math.round(v)}°`}
        />
      </Secao>

      <Secao titulo="legibilidade">
        <Deslizador
          rotulo="desfoque"
          valor={background.blur}
          min={0}
          max={40}
          step={1}
          onChange={(blur) => atualizar({ blur })}
          formatar={(v) => `${v}px`}
        />
        <Deslizador
          rotulo="escurecimento"
          valor={background.darken}
          min={0}
          max={1}
          step={0.01}
          onChange={(darken) => atualizar({ darken })}
          formatar={comoPorcento}
        />
      </Secao>
    </div>
  );
}
