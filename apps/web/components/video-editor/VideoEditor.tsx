"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { Karaoke } from "@/composition/Karaoke";
import { dimensoesDaSaida } from "@/composition/formato";
import { totalDeQuadros } from "@/composition/tempo";
import { prepararVersos } from "@/composition/versos";
import type { KaraokeProps } from "@/composition/props";
import { VideoExport } from "@/components/VideoExport";
import { Waveform } from "@/components/Waveform";
import { api } from "@/lib/api";
import type { TrackDetail, VideoProject, VideoSettings } from "@/lib/types";
import { ABAS } from "./abas";
import type { AbaId } from "./abas";
import { PainelBackground } from "./PainelBackground";
import { PainelFont } from "./PainelFont";
import { PainelMotion } from "./PainelMotion";
import { PainelStructure } from "./PainelStructure";
import { PainelStyle } from "./PainelStyle";
import { PainelTemplates } from "./PainelTemplates";

const SALVAR_DEPOIS_DE_MS = 500;

interface Props {
  track: TrackDetail;
  initialProject: VideoProject;
}

/**
 * O editor de vídeo integrado.
 *
 * O painel da aba EMPURRA o preview, nunca o cobre — é o que permite ver o
 * resultado inteiro enquanto se mexe no controle (`spec.md` §5). O `<Player>`
 * monta a MESMA composição que o render usa; `dimensoesDaSaida()` é a mesma
 * função dos dois lados, uma fonte só.
 */
export function VideoEditor({ track, initialProject }: Props) {
  const [aba, setAba] = useState<AbaId>("background");
  const [settings, setSettings] = useState<VideoSettings>(initialProject.settings);
  const [templateId, setTemplateId] = useState<string | null>(initialProject.template_id);
  const [salvando, setSalvando] = useState(false);
  const [erroDeSalvar, setErroDeSalvar] = useState<string | null>(null);
  const [backgroundVersion, setBackgroundVersion] = useState(0);
  const [configuracaoAnterior, setConfiguracaoAnterior] = useState<VideoSettings | null>(null);
  const salvarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lines = useMemo(() => track.active_lyrics?.lines ?? [], [track.active_lyrics]);
  const versos = useMemo(
    () => prepararVersos(lines, track.lyrics_offset_ms, track.active_lyrics?.language ?? "pt"),
    [lines, track.lyrics_offset_ms, track.active_lyrics?.language],
  );

  const audioUrl = api.audioUrl(track.id, track.has_vocals_stem);
  const backgroundUrl =
    settings.background.kind === "color"
      ? null
      : api.backgroundUrl(track.id, backgroundVersion || 1);

  const persistir = useCallback(
    (proximo: VideoSettings, proximoTemplateId: string | null) => {
      if (salvarTimer.current) clearTimeout(salvarTimer.current);
      salvarTimer.current = setTimeout(() => {
        setSalvando(true);
        setErroDeSalvar(null);
        api
          .updateVideoProject(track.id, proximo, proximoTemplateId)
          .catch(() => setErroDeSalvar("Não foi possível salvar as configurações."))
          .finally(() => setSalvando(false));
      }, SALVAR_DEPOIS_DE_MS);
    },
    [track.id],
  );

  useEffect(() => () => {
    if (salvarTimer.current) clearTimeout(salvarTimer.current);
  }, []);

  function atualizarSettings(proximo: VideoSettings) {
    setSettings(proximo);
    persistir(proximo, templateId);
  }

  function aplicarTemplate(proximo: VideoSettings, proximoTemplateId: string) {
    // A imagem enviada pelo usuário é dele: o template não a substitui.
    const preservado: VideoSettings = {
      ...proximo,
      background: {
        ...proximo.background,
        kind: settings.background.kind === "upload" ? "upload" : proximo.background.kind,
      },
    };
    setConfiguracaoAnterior(settings);
    setTemplateId(proximoTemplateId);
    setSettings(preservado);
    persistir(preservado, proximoTemplateId);
  }

  function desfazerTemplate() {
    if (!configuracaoAnterior) return;
    setSettings(configuracaoAnterior);
    setTemplateId(null);
    setConfiguracaoAnterior(null);
    persistir(configuracaoAnterior, null);
  }

  const { width, height } = dimensoesDaSaida(settings);
  const duracaoMs = track.duration_ms ?? 0;

  const karaokeProps: KaraokeProps = {
    settings,
    versos,
    duracaoMs,
    audioUrl,
    backgroundUrl,
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft pb-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/track/${track.id}`}
            className="font-mono text-xs text-ink-3 hover:text-amber"
          >
            ← voltar
          </Link>
          <div>
            <h1 className="font-display text-lg text-ink">{track.title}</h1>
            <p className="font-mono text-[11px] text-ink-3">{track.artist ?? "artista desconhecido"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {salvando && <span className="font-mono text-[11px] text-ink-3">salvando…</span>}
          {erroDeSalvar && (
            <span role="alert" className="font-mono text-[11px] text-risk">
              {erroDeSalvar}
            </span>
          )}
          {configuracaoAnterior && (
            <button
              type="button"
              onClick={desfazerTemplate}
              className="border border-line px-3 py-1 font-mono text-[11px] text-ink-2 hover:border-amber hover:text-amber"
            >
              desfazer template
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[72px_minmax(0,320px)_minmax(0,1fr)]">
        {/* Barra de abas */}
        <nav className="flex flex-row gap-1 border-b border-line-soft py-2 lg:flex-col lg:border-b-0 lg:border-r lg:py-4">
          {ABAS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setAba((atual) => (atual === item.id ? atual : item.id))}
              className={`flex flex-col items-center gap-1 px-2 py-2 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                aba === item.id
                  ? "bg-surface-2 text-amber"
                  : "text-ink-3 hover:bg-surface hover:text-ink-2"
              }`}
            >
              {item.rotulo}
            </button>
          ))}
        </nav>

        {/* Painel da aba ativa — empurra o preview, não cobre. */}
        <div className="border-b border-line-soft bg-surface p-4 lg:border-b-0 lg:border-r">
          {aba === "background" && (
            <PainelBackground
              trackId={track.id}
              settings={settings}
              hasBackground={track.has_background}
              onChange={atualizarSettings}
              onBackgroundUploaded={() => setBackgroundVersion((v) => v + 1)}
            />
          )}
          {aba === "font" && <PainelFont settings={settings} onChange={atualizarSettings} />}
          {aba === "motion" && <PainelMotion settings={settings} onChange={atualizarSettings} />}
          {aba === "structure" && (
            <PainelStructure settings={settings} onChange={atualizarSettings} />
          )}
          {aba === "style" && <PainelStyle settings={settings} onChange={atualizarSettings} />}
          {aba === "templates" && (
            <PainelTemplates
              currentSettings={settings}
              activeTemplateId={templateId}
              onApply={aplicarTemplate}
            />
          )}
        </div>

        {/* Preview: a mesma composição que o render usa. */}
        <div className="flex flex-col gap-4 p-4">
          <div className="mx-auto w-full max-w-3xl">
            <Player
              component={Karaoke}
              inputProps={karaokeProps}
              compositionWidth={width}
              compositionHeight={height}
              fps={settings.output.fps}
              durationInFrames={totalDeQuadros(duracaoMs, settings.output.fps)}
              controls
              acknowledgeRemotionLicense
              style={{ width: "100%" }}
            />
          </div>

          <Waveform src={audioUrl} />

          <VideoExport trackId={track.id} disabled={false} />
        </div>
      </div>
    </div>
  );
}
