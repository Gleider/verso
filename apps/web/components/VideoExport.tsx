"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatarTimecode } from "@/lib/rascunho";
import type { Recorte } from "@/composition/tempo";
import type { Job } from "@/lib/types";

const RESOLUTIONS = ["720p", "1080p"] as const;
type Resolution = (typeof RESOLUTIONS)[number];

/** Enquanto houver render em andamento, consulta o estado periodicamente. */
const POLL_MS = 2500;

export function VideoExport({
  trackId,
  disabled,
  recorte = null,
}: {
  trackId: string;
  disabled: boolean;
  /** Trecho escolhido no editor, se houver — só para dizer o que vai sair. */
  recorte?: Recorte | null;
}) {
  const [renders, setRenders] = useState<Job[]>([]);
  const [starting, setStarting] = useState<Resolution | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRenders(await api.listRenders(trackId));
    } catch {
      // Uma falha de leitura não deve apagar o que já está na tela.
    }
  }, [trackId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const working = renders.some((job) => job.state === "queued" || job.state === "running");

  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [working, refresh]);

  async function start(resolution: Resolution) {
    setStarting(resolution);
    setError(null);
    try {
      await api.renderVideo(trackId, resolution);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar o vídeo.");
    } finally {
      setStarting(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
        exportar vídeo
      </span>

      <div className="flex flex-wrap items-center gap-2">
        {RESOLUTIONS.map((resolution) => (
          <button
            key={resolution}
            type="button"
            onClick={() => void start(resolution)}
            disabled={disabled || starting !== null || working}
            className="border border-line px-3 py-1.5 font-mono text-xs text-ink-2 transition-colors hover:border-amber hover:text-amber disabled:cursor-not-allowed disabled:opacity-40"
          >
            {starting === resolution ? "iniciando…" : `gerar ${resolution}`}
          </button>
        ))}
      </div>

      {recorte && (
        <p className="border-l-2 border-amber bg-surface px-3 py-1.5 font-mono text-[11px] text-ink-2">
          sai só o trecho {formatarTimecode(recorte.inicioMs)} → {formatarTimecode(recorte.fimMs)}
          {"  "}({formatarTimecode(recorte.fimMs - recorte.inicioMs)})
        </p>
      )}

      {disabled && (
        <p className="text-sm text-ink-2">
          O vídeo usa a letra sincronizada — ele fica disponível quando a transcrição terminar.
        </p>
      )}

      {error && (
        <p role="alert" className="border-l-2 border-risk bg-surface px-3 py-1.5 text-sm text-risk">
          {error}
        </p>
      )}

      {renders.length > 0 && (
        <ul className="flex flex-col gap-1">
          {renders.slice(0, 4).map((job) => {
            const resolution = (job.params?.resolution as string) ?? "vídeo";
            // O worker grava o trecho no job: é o que distingue, aqui, um
            // corte curto do vídeo inteiro — os dois viram "1080p" sem isto.
            const trecho = job.params?.recorteMs as [number, number] | undefined;
            const percent = Math.round(job.progress * 100);

            return (
              <li
                key={job.id}
                className="flex items-center gap-3 border border-line-soft bg-surface px-3 py-2"
              >
                <span className="font-mono text-xs text-ink-2">
                  {resolution}
                  {trecho && (
                    <span className="text-ink-3">
                      {" "}
                      · {formatarTimecode(trecho[0])}→{formatarTimecode(trecho[1])}
                    </span>
                  )}
                </span>

                {job.state === "done" ? (
                  <>
                    <span className="font-mono text-[11px] text-ok">pronto</span>
                    <a
                      href={api.renderDownloadUrl(trackId, job.id)}
                      className="ml-auto border border-amber bg-amber px-3 py-1 font-mono text-[11px] text-ground hover:bg-amber-bright"
                    >
                      baixar .mp4
                    </a>
                  </>
                ) : job.state === "failed" ? (
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-risk" title={job.error ?? ""}>
                    {job.error ?? "falhou"}
                  </span>
                ) : (
                  <>
                    <span className="font-mono text-[11px] text-ink-3">
                      {job.stage ?? "na fila"}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      <span className="h-1 w-24 overflow-hidden bg-surface-2">
                        <span
                          className="block h-full bg-amber transition-[width] duration-500"
                          style={{ width: `${percent}%` }}
                        />
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-amber">
                        {percent}%
                      </span>
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="font-mono text-[11px] text-ink-3">
        O vídeo sai com a imagem de fundo, a letra sincronizada e os ajustes de tempo que você
        salvou. Uma música de 4 minutos leva alguns minutos para ficar pronta.
      </p>
    </div>
  );
}
