"use client";

import { coresDoTexto } from "@/composition/palettes";
import type { CamadaId, LyricsPosition, ParticulaId, VisualizerId } from "@/composition/settings";
import type { VideoSettings } from "@/lib/types";
import { BotaoDeGrupo } from "./BotaoDeGrupo";
import { comoPorcento, corSolida, Deslizador, Interruptor, Secao } from "./Controles";

interface Props {
  settings: VideoSettings;
  onChange: (settings: VideoSettings) => void;
  /** Falso quando a faixa não tem áudio decodificável para analisar. */
  temAudio: boolean;
}

const FORMAS: { id: VisualizerId; rotulo: string; dica: string }[] = [
  { id: "none", rotulo: "Nenhum", dica: "Sem visualizador" },
  {
    id: "barras",
    rotulo: "Barras",
    dica: "O equalizador clássico, uma barra por faixa de frequência",
  },
  { id: "onda", rotulo: "Onda", dica: "Uma linha simétrica, como osciloscópio" },
  { id: "circular", rotulo: "Circular", dica: "As mesmas faixas, dispostas em roda" },
  {
    id: "anel",
    rotulo: "Anel",
    dica: "Um círculo que respira na batida, sem detalhe de frequência",
  },
];

const TIPOS_DE_PARTICULA: { id: ParticulaId; rotulo: string; dica: string }[] = [
  { id: "none", rotulo: "Nenhuma", dica: "Sem partículas" },
  { id: "poeira", rotulo: "Poeira", dica: "Motas lentas à deriva, como pó num facho de luz" },
  { id: "neve", rotulo: "Neve", dica: "Cai e balança de lado" },
  { id: "fagulhas", rotulo: "Fagulhas", dica: "Sobem depressa e tremeluzem; reagem à batida" },
  { id: "estrelas", rotulo: "Estrelas", dica: "Paradas no lugar, só cintilam" },
  { id: "vagalumes", rotulo: "Vaga-lumes", dica: "Vagam devagar e pulsam de brilho" },
];

const CAMADAS: { id: CamadaId; rotulo: string; dica: string }[] = [
  { id: "atras", rotulo: "Atrás da letra", dica: "A letra fica por cima, sempre legível" },
  { id: "frente", rotulo: "Na frente", dica: "Passa por cima da letra" },
];

const POSICOES: { id: LyricsPosition; rotulo: string }[] = [
  { id: "top", rotulo: "Topo" },
  { id: "center", rotulo: "Centro" },
  { id: "bottom", rotulo: "Rodapé" },
];

/**
 * Aba Visualizer: as duas camadas que SOMAM por cima do vídeo.
 *
 * Ficam juntas, e separadas das texturas da aba Style, porque têm em comum o
 * que importa para quem monta: são camadas, não superfícies. Cada uma escolhe
 * se fica atrás ou à frente da letra, e as duas podem estar ligadas ao mesmo
 * tempo — que é justamente o que o catálogo de textura não permite.
 */
export function PainelVisualizer({ settings, onChange, temAudio }: Props) {
  const v = settings.visualizer;
  const p = settings.particulas;
  // Círculo e anel desenham numa caixa quadrada e ignoram a largura. Deixar o
  // deslizador ali seria um controle que não faz nada — o defeito que já
  // apareceu neste editor antes.
  const redondo = v.tipo === "circular" || v.tipo === "anel";
  const corDoTexto = coresDoTexto(settings.style).sung;

  function atualizarV(parcial: Partial<VideoSettings["visualizer"]>) {
    onChange({ ...settings, visualizer: { ...v, ...parcial } });
  }
  function atualizarP(parcial: Partial<VideoSettings["particulas"]>) {
    onChange({ ...settings, particulas: { ...p, ...parcial } });
  }

  return (
    <div className="flex flex-col gap-6">
      <Secao titulo="visualizador de áudio">
        <div className="flex flex-wrap gap-2">
          {FORMAS.map((f) => (
            <BotaoDeGrupo
              key={f.id}
              ativo={v.tipo === f.id}
              onClick={() => atualizarV({ tipo: f.id })}
              dica={f.dica}
              desabilitado={f.id !== "none" && !temAudio}
            >
              {f.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
        {!temAudio && (
          <span className="text-[11px] text-ink-3">
            Esta faixa não tem áudio para analisar — o visualizador precisa dele.
          </span>
        )}

        {v.tipo !== "none" && (
          <>
            <div className="flex flex-wrap gap-2 pt-1">
              {CAMADAS.map((c) => (
                <BotaoDeGrupo
                  key={c.id}
                  ativo={v.camada === c.id}
                  onClick={() => atualizarV({ camada: c.id })}
                  dica={c.dica}
                >
                  {c.rotulo}
                </BotaoDeGrupo>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {POSICOES.map((o) => (
                <BotaoDeGrupo
                  key={o.id}
                  ativo={v.posicao === o.id}
                  onClick={() => atualizarV({ posicao: o.id })}
                >
                  {o.rotulo}
                </BotaoDeGrupo>
              ))}
            </div>
            <Deslizador
              rotulo={redondo ? "diâmetro" : "altura"}
              valor={v.tamanho}
              min={0.04}
              max={0.6}
              step={0.01}
              onChange={(tamanho) => atualizarV({ tamanho })}
              formatar={comoPorcento}
            />
            {!redondo && (
              <Deslizador
                rotulo="largura"
                valor={v.largura}
                min={0.2}
                max={1}
                step={0.01}
                onChange={(largura) => atualizarV({ largura })}
                formatar={comoPorcento}
              />
            )}
            <Deslizador
              rotulo="reação ao áudio"
              valor={v.intensidade}
              min={0}
              max={1}
              step={0.01}
              onChange={(intensidade) => atualizarV({ intensidade })}
              formatar={comoPorcento}
            />
            <Deslizador
              rotulo="opacidade"
              valor={v.opacidade}
              min={0.05}
              max={1}
              step={0.01}
              onChange={(opacidade) => atualizarV({ opacidade })}
              formatar={comoPorcento}
            />
            <Interruptor
              rotulo="espelhar"
              ligado={v.espelhado}
              onChange={(espelhado) => atualizarV({ espelhado })}
              dica="Vira o desenho de cabeça para baixo."
            />
            <label className="flex items-center gap-2 text-xs text-ink-2">
              <input
                type="color"
                value={corSolida(v.cor ?? corDoTexto)}
                onChange={(e) => atualizarV({ cor: e.target.value })}
                className="h-8 w-10 border border-line bg-surface"
              />
              cor
              {v.cor !== null && (
                <button
                  type="button"
                  onClick={() => atualizarV({ cor: null })}
                  className="font-mono text-[11px] text-ink-3 underline hover:text-amber"
                >
                  usar a do texto
                </button>
              )}
            </label>
          </>
        )}
      </Secao>

      <Secao titulo="partículas">
        <div className="flex flex-wrap gap-2">
          {TIPOS_DE_PARTICULA.map((f) => (
            <BotaoDeGrupo
              key={f.id}
              ativo={p.tipo === f.id}
              onClick={() => atualizarP({ tipo: f.id })}
              dica={f.dica}
            >
              {f.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
        <span className="text-[11px] text-ink-3">
          Somam com o efeito de vídeo da aba Style, em vez de substituí-lo.
        </span>

        {p.tipo !== "none" && (
          <>
            <div className="flex flex-wrap gap-2 pt-1">
              {CAMADAS.map((c) => (
                <BotaoDeGrupo
                  key={c.id}
                  ativo={p.camada === c.id}
                  onClick={() => atualizarP({ camada: c.id })}
                  dica={c.dica}
                >
                  {c.rotulo}
                </BotaoDeGrupo>
              ))}
            </div>
            <Deslizador
              rotulo="quantidade"
              valor={p.quantidade}
              min={0}
              max={1}
              step={0.01}
              onChange={(quantidade) => atualizarP({ quantidade })}
              formatar={comoPorcento}
            />
            <Deslizador
              rotulo="tamanho"
              valor={p.tamanho}
              min={0}
              max={1}
              step={0.01}
              onChange={(tamanho) => atualizarP({ tamanho })}
              formatar={comoPorcento}
            />
            <Deslizador
              rotulo="velocidade"
              valor={p.velocidade}
              min={0}
              max={1}
              step={0.01}
              onChange={(velocidade) => atualizarP({ velocidade })}
              formatar={comoPorcento}
            />
            <Deslizador
              rotulo="opacidade"
              valor={p.opacidade}
              min={0.05}
              max={1}
              step={0.01}
              onChange={(opacidade) => atualizarP({ opacidade })}
              formatar={comoPorcento}
            />
            <Deslizador
              rotulo="reação à batida"
              valor={p.reacaoBatida}
              min={0}
              max={1}
              step={0.01}
              onChange={(reacaoBatida) => atualizarP({ reacaoBatida })}
              formatar={comoPorcento}
            />
            <label className="flex items-center gap-2 text-xs text-ink-2">
              <input
                type="color"
                value={corSolida(p.cor ?? "#ffffff")}
                onChange={(e) => atualizarP({ cor: e.target.value })}
                className="h-8 w-10 border border-line bg-surface"
              />
              cor
              {p.cor !== null && (
                <button
                  type="button"
                  onClick={() => atualizarP({ cor: null })}
                  className="font-mono text-[11px] text-ink-3 underline hover:text-amber"
                >
                  usar a natural do tipo
                </button>
              )}
            </label>
          </>
        )}
      </Secao>
    </div>
  );
}
