"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Job } from "@/lib/types";

/**
 * Acompanha o job pelo SSE.
 *
 * É isto que faz a espera de três minutos parecer aceitável: o usuário vê
 * "separando o vocal · 40%" em vez de um spinner mudo.
 */
export function ProcessingStatus({ trackId, initialJob }: { trackId: string; initialJob: Job | null }) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(initialJob);

  useEffect(() => {
    const source = new EventSource(api.eventsUrl(trackId));

    source.addEventListener("progress", (event) => {
      setJob(JSON.parse((event as MessageEvent).data) as Job);
    });

    source.addEventListener("done", (event) => {
      setJob(JSON.parse((event as MessageEvent).data) as Job);
      source.close();
      router.refresh();
    });

    source.onerror = () => source.close();

    return () => source.close();
  }, [trackId, router]);

  if (!job) {
    return (
      <p className="border border-line bg-surface px-5 py-8 text-center text-sm text-ink-2">
        Esta faixa ainda não foi processada.
      </p>
    );
  }

  if (job.state === "failed") {
    return (
      <div className="border border-line border-l-2 border-l-risk bg-surface px-5 py-5">
        <p className="font-display font-semibold text-risk">A transcrição falhou</p>
        <p className="mt-2 text-sm text-ink-2">{job.error ?? "Sem detalhes."}</p>
        <button
          type="button"
          onClick={async () => {
            await api.retranscribe(trackId);
            router.refresh();
          }}
          className="mt-4 border border-line px-3 py-1.5 font-mono text-xs text-ink-2 hover:border-amber hover:text-amber"
        >
          tentar de novo
        </button>
      </div>
    );
  }

  const percent = Math.round(job.progress * 100);

  return (
    <div className="border border-line bg-surface px-5 py-6">
      <div className="flex items-baseline justify-between">
        <p className="font-display font-semibold">{job.stage ?? "na fila"}</p>
        <span className="font-mono text-sm tabular-nums text-amber">{percent}%</span>
      </div>
      <div className="mt-3 h-1 w-full overflow-hidden bg-surface-2">
        <div
          className="h-full bg-amber transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-3 text-sm text-ink-2">
        Separar a voz do instrumental é o que faz a transcrição valer a pena — e é também o que
        leva mais tempo. Pode fechar esta aba; o processamento continua.
      </p>
    </div>
  );
}
