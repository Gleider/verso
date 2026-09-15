"use client";

import type { LyricsPosition } from "@/composition/settings";
import type { VideoSettings } from "@/lib/types";
import { BotaoDeGrupo } from "./BotaoDeGrupo";
import { comoPorcento, Deslizador, Secao } from "./Controles";

interface Props {
  settings: VideoSettings;
  onChange: (settings: VideoSettings) => void;
}

const POSICOES: { id: LyricsPosition; rotulo: string }[] = [
  { id: "top", rotulo: "Topo" },
  { id: "center", rotulo: "Centro" },
  { id: "bottom", rotulo: "Rodapé" },
];

/**
 * Aba Structure: posição da letra na tela e se os versos vizinhos aparecem.
 *
 * O ramo existe mesmo com poucos campos (o pedido explícito foi "por ora só a
 * posição da letra") para que acrescentar outros tipos depois não seja
 * mudança de formato.
 */
export function PainelStructure({ settings, onChange }: Props) {
  const { structure } = settings;

  function atualizar(parcial: Partial<VideoSettings["structure"]>) {
    onChange({ ...settings, structure: { ...structure, ...parcial } });
  }

  return (
    <div className="flex flex-col gap-6">
      <Secao titulo="posição da letra">
        <div className="flex flex-wrap gap-2">
          {POSICOES.map((p) => (
            <BotaoDeGrupo
              key={p.id}
              ativo={structure.lyricsPosition === p.id}
              onClick={() => atualizar({ lyricsPosition: p.id })}
            >
              {p.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
      </Secao>

      <Secao titulo="versos vizinhos">
        <Deslizador
          rotulo="quantos de cada lado"
          valor={structure.vizinhos}
          min={0}
          max={3}
          step={1}
          onChange={(vizinhos) => atualizar({ vizinhos })}
          formatar={(v) => (v === 0 ? "nenhum" : v === 1 ? "1 linha" : `${v} linhas`)}
          dica="Mesma fonte, mesmos efeitos e mesmo movimento do verso atual."
        />
        <Deslizador
          rotulo="transparência"
          valor={structure.opacidadeVizinhos}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(opacidadeVizinhos) => atualizar({ opacidadeVizinhos })}
          formatar={comoPorcento}
          desabilitado={structure.vizinhos === 0}
        />
      </Secao>
    </div>
  );
}
