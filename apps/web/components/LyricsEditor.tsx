"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  type Salvamento,
  type VersoRascunho,
  comTempo,
  foraDoAlcance,
  formatarTimecode,
  oQueSalvar,
  paraRascunho,
  parseTimecode,
  versoNovo,
} from "@/lib/rascunho";
import type { LyricsVersion, VersionSummary, WordTiming } from "@/lib/types";

const LOW_CONFIDENCE = 0.5;

const ORIGEM: Record<string, string> = {
  asr: "gerada",
  imported: "importada",
  musixmatch: "musixmatch",
  user_edit: "editada",
};

interface Props {
  trackId: string;
  version: LyricsVersion;
  /** Ajuste global da faixa: entra na conta do tempo que a tela mostra. */
  offsetMs: number;
  currentMs: number;
  onSeek: (ms: number) => void;
  onSaved: (version: LyricsVersion) => void;
}

/**
 * Uma palavra que o modelo não teve certeza fica marcada: é por onde começar.
 *
 * `reviewed` desliga a marcação: depois que um humano validou a linha, a
 * incerteza do modelo sobre ela não interessa mais.
 */
function Words({ words, reviewed }: { words: WordTiming[]; reviewed: boolean }) {
  return (
    <>
      {words.map((word, index) => {
        const uncertain = !reviewed && word.p < LOW_CONFIDENCE;
        return (
          <span
            key={`${word.s}-${index}`}
            className={uncertain ? "low-confidence" : undefined}
            title={uncertain ? `confiança ${word.p.toFixed(2)}` : undefined}
          >
            {word.w}
            {index < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </>
  );
}

/** Versões anteriores da letra: voltar para uma, ou descartar a que saiu errada. */
function PainelDeVersoes({
  trackId,
  versionId,
  onTrocou,
}: {
  trackId: string;
  versionId: string;
  onTrocou: (version: LyricsVersion) => void;
}) {
  const [versoes, setVersoes] = useState<VersionSummary[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    api
      .listVersions(trackId)
      .then(setVersoes)
      .catch((causa) =>
        setErro(causa instanceof Error ? causa.message : "Não foi possível listar as versões."),
      );
  }, [trackId]);

  // Recarrega quando a versão ativa muda: salvar acaba de criar mais uma.
  useEffect(carregar, [carregar, versionId]);

  async function agir(id: string, acao: "usar" | "descartar") {
    if (acao === "descartar" && !window.confirm("Apagar esta versão da letra? Não tem volta.")) {
      return;
    }
    setOcupado(id);
    setErro(null);
    try {
      const ativa =
        acao === "usar"
          ? await api.activateVersion(trackId, id)
          : await api.discardVersion(trackId, id);
      onTrocou(ativa);
      carregar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível mudar a versão.");
    } finally {
      setOcupado(null);
    }
  }

  if (erro) {
    return (
      <p role="alert" className="border-l-2 border-risk bg-surface px-4 py-2 text-sm text-risk">
        {erro}
      </p>
    );
  }
  if (versoes === null) {
    return <p className="px-4 py-2 font-mono text-[11px] text-ink-3">carregando versões…</p>;
  }

  return (
    <ul className="flex flex-col border border-line bg-surface">
      {versoes.map((versao, indice) => (
        <li
          key={versao.id}
          className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 font-mono text-[11px] ${
            indice > 0 ? "border-t border-line-soft" : ""
          } ${versao.is_active ? "text-amber" : "text-ink-2"}`}
        >
          <strong className="tabular-nums">v{versao.version_no}</strong>
          <span className="text-ink-3">{ORIGEM[versao.source] ?? versao.source}</span>
          <span className="text-ink-3">{versao.line_count} versos</span>
          <span className="text-ink-3">
            {new Date(versao.created_at).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span className="ml-auto flex gap-3">
            {versao.is_active ? (
              <span className="text-amber">em uso</span>
            ) : (
              <button
                type="button"
                disabled={ocupado !== null}
                onClick={() => void agir(versao.id, "usar")}
                className="text-ink-2 hover:text-amber disabled:opacity-40"
              >
                usar esta
              </button>
            )}
            <button
              type="button"
              disabled={ocupado !== null || versoes.length <= 1}
              onClick={() => void agir(versao.id, "descartar")}
              title={
                versoes.length <= 1
                  ? "é a única versão da letra"
                  : "apagar esta versão para sempre"
              }
              className="text-ink-3 hover:text-risk disabled:opacity-40"
            >
              descartar
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function LyricsEditor({
  trackId,
  version,
  offsetMs,
  currentMs,
  onSeek,
  onSaved,
}: Props) {
  const [mode, setMode] = useState<"lines" | "paste">("lines");
  const originais = useMemo(() => paraRascunho(version.lines, offsetMs), [version.lines, offsetMs]);
  const [versos, setVersos] = useState<VersoRascunho[]>(originais);
  const [pasted, setPasted] = useState("");
  const [editandoTexto, setEditandoTexto] = useState<string | null>(null);
  const [tempoEmEdicao, setTempoEmEdicao] = useState<{ chave: string; valor: string } | null>(null);
  const [mostrarVersoes, setMostrarVersoes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVersos(originais);
    setTempoEmEdicao(null);
  }, [originais]);

  const pendente: Salvamento = useMemo(
    () => (mode === "paste" ? (pasted.trim() ? "versao" : null) : oQueSalvar(versos, originais)),
    [mode, pasted, versos, originais],
  );

  /** O verso que está tocando agora — pelo tempo que a tela mostra. */
  const ativo = useMemo(() => {
    let encontrado = -1;
    versos.forEach((verso, indice) => {
      if (verso.tempoMs !== null && currentMs >= verso.tempoMs) encontrado = indice;
    });
    return encontrado;
  }, [currentMs, versos]);

  /** O texto como veio do servidor, por verso: diz se ainda dá para mostrar as palavras. */
  const textoOriginal = useMemo(
    () => new Map(originais.map((verso) => [verso.chave, verso.texto])),
    [originais],
  );

  /** Só conta o que ainda ninguém olhou; verso revisado sai das pendências. */
  const baixaConfianca = useMemo(
    () =>
      versos.reduce(
        (total, verso) =>
          verso.revisado
            ? total
            : total + verso.palavras.filter((word) => word.p < LOW_CONFIDENCE).length,
        0,
      ),
    [versos],
  );

  /** Mantém a lista na mesma ordem do vídeo: quem decide é o tempo, não a digitação. */
  const ordenar = useCallback(
    (lista: VersoRascunho[]) =>
      [...lista].sort((a, b) => (a.tempoMs ?? Number.MAX_SAFE_INTEGER) - (b.tempoMs ?? Number.MAX_SAFE_INTEGER)),
    [],
  );

  const trocar = useCallback((chave: string, mudanca: (verso: VersoRascunho) => VersoRascunho) => {
    setVersos((atual) => atual.map((verso) => (verso.chave === chave ? mudanca(verso) : verso)));
  }, []);

  const inserir = useCallback(
    (tempoMs: number) => {
      const novo = versoNovo(tempoMs, offsetMs);
      setVersos((atual) => ordenar([...atual, novo]));
      setEditandoTexto(novo.chave);
    },
    [offsetMs, ordenar],
  );

  const comitarTempo = useCallback(() => {
    if (tempoEmEdicao === null) return;
    const { chave, valor } = tempoEmEdicao;
    setTempoEmEdicao(null);

    const ms = parseTimecode(valor);
    if (ms === null) {
      setError(`"${valor}" não é um tempo. Escreva como 01:23.45, 1:23 ou 83.4.`);
      return;
    }
    const alvo = versos.find((verso) => verso.chave === chave);
    if (alvo && foraDoAlcance(alvo, ms, offsetMs)) {
      setError(
        "Este verso ficaria a mais de 30 s do tempo medido, que é o limite do ajuste por " +
          "verso. Para deslocar a letra inteira, use o ajuste de sincronia no player.",
      );
      return;
    }
    setError(null);
    setVersos((atual) =>
      ordenar(atual.map((verso) => (verso.chave === chave ? comTempo(verso, ms, offsetMs) : verso))),
    );
  }, [tempoEmEdicao, versos, offsetMs, ordenar]);

  const save = useCallback(async () => {
    if (pendente === null) return;
    setSaving(true);
    setError(null);
    try {
      const salva =
        mode === "paste"
          ? await api.importLyrics(trackId, pasted)
          : pendente === "versao"
            ? await api.saveLyrics(
                trackId,
                versos.filter((verso) => verso.texto.trim()),
              )
            : await api.saveNudges(
                trackId,
                versos
                  .filter((verso) => verso.id !== null)
                  .map((verso) => ({ line_id: verso.id as string, nudge_ms: verso.nudgeMs })),
              );
      onSaved(salva);
      setMode("lines");
      setPasted("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }, [pendente, mode, pasted, versos, trackId, onSaved]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        void save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const rotuloDoBotao =
    pendente === "tempo" ? "gravar os tempos" : `salvar como v${version.version_no + 1}`;

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-lg font-semibold tracking-tight">Letra</h2>
          <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
            v{version.version_no} · {ORIGEM[version.source] ?? version.source}
            {version.language ? ` · ${version.language}` : ""}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMostrarVersoes(!mostrarVersoes)}
            aria-expanded={mostrarVersoes}
            className={`border px-3 py-1.5 font-mono text-xs transition-colors hover:border-amber hover:text-amber ${
              mostrarVersoes ? "border-amber text-amber" : "border-line text-ink-2"
            }`}
          >
            versões
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === "lines" ? "paste" : "lines")}
            className="border border-line px-3 py-1.5 font-mono text-xs text-ink-2 transition-colors hover:border-amber hover:text-amber"
          >
            {mode === "lines" ? "colar letra pronta" : "voltar à edição"}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || pendente === null}
            className="border border-amber bg-amber px-3 py-1.5 font-mono text-xs text-ground transition-colors hover:bg-amber-bright disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "salvando…" : rotuloDoBotao}
          </button>
        </div>
      </header>

      {mostrarVersoes && (
        <PainelDeVersoes
          trackId={trackId}
          versionId={version.id}
          onTrocou={(ativa) => {
            onSaved(ativa);
            setError(null);
          }}
        />
      )}

      {baixaConfianca > 0 && mode === "lines" && (
        <p className="border-l-2 border-risk bg-surface px-4 py-2 text-sm text-ink-2">
          <strong className="text-risk">{baixaConfianca}</strong>{" "}
          {baixaConfianca === 1 ? "palavra saiu" : "palavras saíram"} com baixa confiança. Elas
          aparecem sublinhadas — comece por elas.
        </p>
      )}

      {error && (
        <p role="alert" className="border-l-2 border-risk bg-surface px-4 py-2 text-sm text-risk">
          {error}
        </p>
      )}

      {mode === "paste" ? (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="pasted-lyrics"
            className="font-mono text-[11px] uppercase tracking-wider text-ink-3"
          >
            um verso por linha · linha em branco separa estrofes
          </label>
          <textarea
            id="pasted-lyrics"
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            rows={18}
            placeholder="Cole aqui a letra que você já tem."
            className="w-full resize-y border border-line bg-surface px-4 py-3 font-body text-[15px] leading-relaxed text-ink placeholder:text-ink-3 focus:border-amber focus:outline-none"
          />
          <p className="text-sm text-ink-2">
            O que coincidir com o áudio mantém o timing medido; o resto entra marcado para
            realinhamento.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inserir(currentMs)}
              className="border border-line px-3 py-1.5 font-mono text-xs text-ink-2 transition-colors hover:border-amber hover:text-amber"
            >
              + verso em {formatarTimecode(currentMs)}
            </button>
            <span className="font-mono text-[11px] text-ink-3">
              o novo verso entra na posição que o tempo mandar
            </span>
          </div>

          <ol className="flex flex-col border border-line">
            {versos.map((verso, indice) => {
              const editandoEste = editandoTexto === verso.chave;
              const tempoDeste = tempoEmEdicao?.chave === verso.chave ? tempoEmEdicao.valor : null;
              const proximo = versos[indice + 1];
              const novo = verso.id === null;
              return (
                <li
                  key={verso.chave}
                  className={`flex items-start gap-2 border-line-soft px-3 py-2 ${
                    indice > 0 ? "border-t" : ""
                  } ${verso.abreEstrofe && indice > 0 ? "border-t-line" : ""} ${
                    indice === ativo ? "bg-amber-soft" : "bg-surface"
                  }`}
                >
                  {tempoDeste !== null ? (
                    <input
                      autoFocus
                      value={tempoDeste}
                      onChange={(event) =>
                        setTempoEmEdicao({ chave: verso.chave, valor: event.target.value })
                      }
                      onBlur={comitarTempo}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          comitarTempo();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setTempoEmEdicao(null);
                        }
                      }}
                      aria-label={`tempo do verso ${indice + 1}`}
                      className="w-[72px] shrink-0 border-b border-amber bg-transparent font-mono text-[11px] tabular-nums text-ink focus:outline-none"
                    />
                  ) : (
                    <span className="flex shrink-0 flex-col items-start">
                      <button
                        type="button"
                        onClick={() => verso.tempoMs !== null && onSeek(verso.tempoMs)}
                        onDoubleClick={() =>
                          setTempoEmEdicao({
                            chave: verso.chave,
                            valor: formatarTimecode(verso.tempoMs),
                          })
                        }
                        title="clique para tocar daqui · dois cliques para digitar o tempo"
                        className={`font-mono text-[11px] tabular-nums transition-colors hover:text-amber-bright ${
                          indice === ativo ? "text-amber" : "text-ink-3"
                        }`}
                      >
                        {formatarTimecode(verso.tempoMs)}
                      </button>
                      <span className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setTempoEmEdicao({
                              chave: verso.chave,
                              valor: formatarTimecode(verso.tempoMs),
                            })
                          }
                          title="digitar o tempo deste verso"
                          className="font-mono text-[10px] text-ink-3 hover:text-amber"
                        >
                          editar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setError(null);
                            if (foraDoAlcance(verso, currentMs, offsetMs)) {
                              setError(
                                "Este verso ficaria a mais de 30 s do tempo medido, que é o " +
                                  "limite do ajuste por verso.",
                              );
                              return;
                            }
                            setVersos((atual) =>
                              ordenar(
                                atual.map((outro) =>
                                  outro.chave === verso.chave
                                    ? comTempo(outro, currentMs, offsetMs)
                                    : outro,
                                ),
                              ),
                            );
                          }}
                          title="trazer este verso para o instante que está tocando"
                          className="font-mono text-[10px] text-ink-3 hover:text-amber"
                        >
                          aqui
                        </button>
                      </span>
                    </span>
                  )}

                  {editandoEste ? (
                    <input
                      autoFocus
                      value={verso.texto}
                      onChange={(event) =>
                        trocar(verso.chave, (atual) => ({ ...atual, texto: event.target.value }))
                      }
                      onBlur={() => setEditandoTexto(null)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === "Escape") {
                          event.preventDefault();
                          setEditandoTexto(null);
                        }
                      }}
                      placeholder={novo ? "o que se canta aqui" : undefined}
                      aria-label={`verso ${indice + 1}`}
                      className="min-w-0 flex-1 border-b border-amber bg-transparent font-body text-[15px] text-ink placeholder:text-ink-3 focus:outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditandoTexto(verso.chave)}
                      aria-label={`editar verso ${indice + 1}`}
                      className="min-w-0 flex-1 text-left font-body text-[15px] text-ink hover:text-amber-bright"
                    >
                      {/* Verso importado (.lrc/Musixmatch) e verso novo não têm palavras
                          medidas — aí o texto da linha é tudo que existe. Quando há, as
                          palavras vêm marcadas pela confiança do modelo. */}
                      {verso.palavras.length > 0 && verso.texto === textoOriginal.get(verso.chave) ? (
                        <Words words={verso.palavras} reviewed={verso.revisado} />
                      ) : (
                        verso.texto || <span className="text-ink-3">(verso vazio)</span>
                      )}
                    </button>
                  )}

                  {/* Sem editar nada: você ouviu e o verso está certo. */}
                  {!verso.revisado && verso.palavras.some((word) => word.p < LOW_CONFIDENCE) && (
                    <button
                      type="button"
                      onClick={() => trocar(verso.chave, (atual) => ({ ...atual, revisado: true }))}
                      title="está certo — tirar a marcação deste verso"
                      className="shrink-0 pt-0.5 font-mono text-[10px] text-ink-3 hover:text-ok"
                    >
                      confirmar
                    </button>
                  )}

                  {verso.precisaRealinhar && (
                    <span
                      title="timing interpolado ou escrito à mão, não medido"
                      className="shrink-0 pt-0.5 font-mono text-[10px] text-ink-3"
                    >
                      ~
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      inserir(
                        proximo?.tempoMs != null && verso.tempoMs !== null
                          ? Math.round((verso.tempoMs + proximo.tempoMs) / 2)
                          : (verso.tempoMs ?? currentMs) + 2000,
                      )
                    }
                    title="inserir um verso logo depois deste"
                    className="shrink-0 pt-0.5 font-mono text-[11px] text-ink-3 hover:text-amber"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setVersos((atual) => atual.filter((outro) => outro.chave !== verso.chave))
                    }
                    title="remover este verso"
                    className="shrink-0 pt-0.5 font-mono text-[11px] text-ink-3 hover:text-risk"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}

      <p className="font-mono text-[11px] leading-relaxed text-ink-3">
        ⌘S salva · clique no tempo para tocar o verso, dois cliques para digitá-lo · mexer só nos
        tempos grava por cima, sem criar versão; mexer no texto cria a versão seguinte
      </p>
    </section>
  );
}
