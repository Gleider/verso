"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon, ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import { Karaoke } from "@/composition/Karaoke";
import { dimensoesDaSaida } from "@/composition/formato";
import { quadroDoMs, totalDeQuadros } from "@/composition/tempo";
import { prepararVersos } from "@/composition/versos";
import type { KaraokeProps } from "@/composition/props";
import { VideoExport } from "@/components/VideoExport";
import { Waveform } from "@/components/Waveform";
import type { WaveformHandle } from "@/components/Waveform";
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
  const pendenteRef = useRef<{ settings: VideoSettings; templateId: string | null } | null>(null);
  const playerRef = useRef<PlayerRef>(null);
  const ondaRef = useRef<WaveformHandle>(null);

  const lines = useMemo(() => track.active_lyrics?.lines ?? [], [track.active_lyrics]);
  const versos = useMemo(
    () => prepararVersos(lines, track.lyrics_offset_ms, track.active_lyrics?.language ?? "pt"),
    [lines, track.lyrics_offset_ms, track.active_lyrics?.language],
  );

  const audioUrl = api.audioUrl(track.id, track.has_vocals_stem);
  // Só `upload` e `cover` têm arquivo. `library` desenha o fundo por CSS e
  // `color` é cor sólida: pedir a imagem nesses dois casos dava 404 numa faixa
  // que nunca enviou nada.
  const usaArquivo = settings.background.kind === "upload" || settings.background.kind === "cover";
  const backgroundUrl = usaArquivo ? api.backgroundUrl(track.id, backgroundVersion || 1) : null;

  const persistir = useCallback(
    (proximo: VideoSettings, proximoTemplateId: string | null) => {
      // Guardado ANTES do temporizador: é o que permite descarregar a gravação
      // pendente na saída, sem depender de o `setTimeout` chegar a disparar.
      pendenteRef.current = { settings: proximo, templateId: proximoTemplateId };
      if (salvarTimer.current) clearTimeout(salvarTimer.current);
      salvarTimer.current = setTimeout(() => {
        salvarTimer.current = null;
        const pendente = pendenteRef.current;
        if (!pendente) return;
        pendenteRef.current = null;
        setSalvando(true);
        setErroDeSalvar(null);
        api
          .updateVideoProject(track.id, pendente.settings, pendente.templateId)
          .catch(() => setErroDeSalvar("Não foi possível salvar as configurações."))
          .finally(() => setSalvando(false));
      }, SALVAR_DEPOIS_DE_MS);
    },
    [track.id],
  );

  /**
   * Descarrega a gravação pendente imediatamente.
   *
   * O editor salva com meio segundo de atraso para não mandar uma requisição
   * por pixel de deslizador. Sair da tela dentro dessa janela — clicar em
   * "voltar" logo depois de mexer num controle — cancelava o temporizador na
   * limpeza do efeito e **perdia todos os ajustes**, sem nenhum aviso. Agora a
   * saída força a gravação.
   */
  const descarregar = useCallback(
    (keepalive: boolean) => {
      if (salvarTimer.current) {
        clearTimeout(salvarTimer.current);
        salvarTimer.current = null;
      }
      const pendente = pendenteRef.current;
      if (!pendente) return;
      pendenteRef.current = null;
      void api
        .updateVideoProject(track.id, pendente.settings, pendente.templateId, keepalive)
        .catch(() => undefined);
    },
    [track.id],
  );

  useEffect(() => {
    // `beforeunload` cobre recarregar e fechar a aba; a limpeza cobre a
    // navegação interna do Next, que não dispara `beforeunload`.
    const aoSair = () => descarregar(true);
    window.addEventListener("beforeunload", aoSair);
    return () => {
      window.removeEventListener("beforeunload", aoSair);
      descarregar(false);
    };
  }, [descarregar]);

  const fps = settings.output.fps;

  /**
   * O cursor da forma de onda segue o `<Player>`, quadro a quadro.
   *
   * Direto no wavesurfer por `ref`, sem estado do React: um `setState` por
   * quadro re-renderizaria o editor inteiro (a regra de sempre, em
   * `architecture.md` — nada de re-render em laço de animação).
   */
  useEffect(() => {
    let pedido = 0;
    let ultimoQuadro = -1;
    const passo = () => {
      const player = playerRef.current;
      if (player) {
        const quadro = player.getCurrentFrame();
        if (quadro !== ultimoQuadro) {
          ultimoQuadro = quadro;
          ondaRef.current?.irPara((quadro / fps) * 1000);
        }
      }
      pedido = requestAnimationFrame(passo);
    };
    pedido = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(pedido);
  }, [fps]);

  const buscarNoPlayer = useCallback(
    (ms: number) => {
      playerRef.current?.seekTo(quadroDoMs(ms, fps));
    },
    [fps],
  );

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
  const retrato = settings.output.aspectRatio === "9:16";
  const duracaoMs = track.duration_ms ?? 0;
  // Sincronia por palavra e por sílaba só existe se a letra tiver timing por
  // palavra. Letra vinda de .lrc ou do Musixmatch tem tempo por VERSO, e o
  // controle ficava lá oferecendo uma opção que não mudava nada.
  const temTimingPorPalavra = versos.some((v) => v.palavras.length > 0);

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
            title="Volta para a faixa. Os ajustes já foram salvos."
            className="flex items-center gap-1 font-mono text-xs text-ink-3 hover:text-amber"
          >
            <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
            voltar
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
              title="Volta para a configuração que existia antes de aplicar o template"
              className="flex items-center gap-1.5 border border-line px-3 py-1 font-mono text-[11px] text-ink-2 hover:border-amber hover:text-amber"
            >
              <ArrowUturnLeftIcon className="h-3.5 w-3.5" aria-hidden="true" />
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
              title={item.dica}
              aria-current={aba === item.id ? "page" : undefined}
              className={`flex flex-col items-center gap-1 px-2 py-2 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                aba === item.id
                  ? "bg-surface-2 text-amber"
                  : "text-ink-3 hover:bg-surface hover:text-ink-2"
              }`}
            >
              <item.Icone className="h-5 w-5" aria-hidden="true" />
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
          {aba === "motion" && (
            <PainelMotion
              settings={settings}
              onChange={atualizarSettings}
              temTimingPorPalavra={temTimingPorPalavra}
            />
          )}
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
          {/* A CAIXA do preview é sempre a mesma, em 16:9 e em 9:16 — o que
              muda é o vídeo dentro dela. Antes o player recebia `width: 100%`
              e o retrato esticava para 1,77x a altura da paisagem, estourando
              a tela e empurrando a página inteira. */}
          <div
            className="mx-auto flex w-full max-w-3xl items-center justify-center"
            style={{ aspectRatio: "16 / 9" }}
          >
            <Player
              ref={playerRef}
              component={Karaoke}
              inputProps={karaokeProps}
              compositionWidth={width}
              compositionHeight={height}
              fps={fps}
              durationInFrames={totalDeQuadros(duracaoMs, fps)}
              // Abrir no primeiro verso, não no quadro 0: a maioria das faixas
              // começa com introdução instrumental, e o editor abria numa tela
              // sem letra nenhuma — parecia que o preview não funcionava.
              initialFrame={quadroDoMs(versos[0]?.inicioMs ?? 0, fps)}
              controls
              acknowledgeRemotionLicense
              // Encaixa dentro da caixa preservando a proporção: em 16:9 ocupa
              // a largura toda, em 9:16 ocupa a altura toda e fica estreito.
              // Só uma das dimensões é fixada — com as duas em `100%` o
              // `aspect-ratio` é ignorado e o vídeo distorce.
              style={
                retrato
                  ? { height: "100%", aspectRatio: `${width} / ${height}` }
                  : { width: "100%", aspectRatio: `${width} / ${height}` }
              }
            />
          </div>

          <Waveform
            ref={ondaRef}
            src={audioUrl}
            controlado
            onSeekMs={buscarNoPlayer}
          />

          <VideoExport trackId={track.id} disabled={false} />
        </div>
      </div>
    </div>
  );
}
