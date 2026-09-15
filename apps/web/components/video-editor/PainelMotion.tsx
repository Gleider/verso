"use client";

import { MODOS } from "@/composition/motion";
import type { SyncId, TweakId } from "@/composition/settings";
import type { VideoSettings } from "@/lib/types";
import { BotaoDeGrupo } from "./BotaoDeGrupo";
import { comoPorcento, Deslizador, Interruptor, Secao } from "./Controles";

interface Props {
  settings: VideoSettings;
  onChange: (settings: VideoSettings) => void;
  /** Falso quando a letra veio com tempo por verso (.lrc, Musixmatch). */
  temTimingPorPalavra: boolean;
}

const TWEAKS: { id: TweakId; rotulo: string; dica: string }[] = [
  { id: "floating", rotulo: "Flutuante", dica: "O verso deriva devagar, com fase própria" },
  { id: "none", rotulo: "Nenhum", dica: "O verso fica parado depois de entrar" },
];

/**
 * O que cada modo faz, em uma linha.
 *
 * Mora aqui e não em `composition/motion/*`: é texto de interface. O rótulo
 * curto ("Salto", "Recorte", "Varredura") não diz o que vai acontecer na tela.
 */
const DICAS_DE_ANIMACAO: Record<string, string> = {
  fill: "Karaokê clássico: a cor avança dentro do verso, sem mexer na geometria",
  fade: "O verso aparece e some por opacidade, com uma aproximação leve",
  slide: "Entra deslizando de um lado e sai pelo outro",
  wipe: "Uma máscara varre da esquerda e revela o verso",
  popup: "Salta de escala, passa do ponto e assenta",
  scaling: "Entra pequeno e continua crescendo enquanto está em cena",
  mask: "A letra vira janela: o fundo aparece dentro do próprio texto",
  bubbling: "Cada palavra flutua com fase própria; a cantada salta",
  static: "Aparece e fica. Sem animação de entrada",
};

const SINCRONIAS: { id: SyncId; rotulo: string; dica: string; exigeTiming: boolean }[] = [
  {
    id: "line",
    rotulo: "Linha",
    dica: "O verso inteiro preenche de uma vez. Funciona com qualquer letra.",
    exigeTiming: false,
  },
  {
    id: "word",
    rotulo: "Palavra",
    dica: "Uma palavra por vez. Precisa de letra com tempo por palavra.",
    exigeTiming: true,
  },
  {
    id: "syllable",
    rotulo: "Sílaba",
    dica: "O destaque acompanha o canto. Precisa de letra com tempo por palavra.",
    exigeTiming: true,
  },
];

/** Aba Motion: como o texto entra, sai e se move enquanto está em cena. */
export function PainelMotion({ settings, onChange, temTimingPorPalavra }: Props) {
  const { motion } = settings;
  const dicaDaSincronia = SINCRONIAS.find((s) => s.id === motion.sync)?.dica;

  function atualizar(parcial: Partial<VideoSettings["motion"]>) {
    onChange({ ...settings, motion: { ...motion, ...parcial } });
  }

  return (
    <div className="flex flex-col gap-6">
      <Secao titulo="animação">
        <div className="grid grid-cols-2 gap-2">
          {Object.values(MODOS).map((modo) => (
            <BotaoDeGrupo
              key={modo.id}
              ativo={motion.animation === modo.id}
              onClick={() => atualizar({ animation: modo.id })}
              dica={DICAS_DE_ANIMACAO[modo.id]}
            >
              {modo.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
        <Deslizador
          rotulo="intensidade"
          valor={motion.intensidade}
          min={0}
          max={1}
          step={0.01}
          onChange={(intensidade) => atualizar({ intensidade })}
          formatar={comoPorcento}
          dica="Quanto o modo escolhido exagera. Nunca chega a zero."
        />
        <Deslizador
          rotulo="duração da entrada"
          valor={motion.durationMs}
          min={80}
          max={1600}
          step={20}
          onChange={(durationMs) => atualizar({ durationMs })}
          formatar={(v) => `${v}ms`}
        />
        <Interruptor
          rotulo="animar também a saída"
          ligado={motion.saida}
          onChange={(saida) => atualizar({ saida })}
          dica="Desligado, o verso some de uma vez quando o próximo começa."
        />
      </Secao>

      <Secao titulo="movimento contínuo">
        <div className="flex flex-wrap gap-2">
          {TWEAKS.map((t) => (
            <BotaoDeGrupo
              key={t.id}
              ativo={motion.tweak === t.id}
              onClick={() => atualizar({ tweak: t.id })}
              dica={t.dica}
            >
              {t.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
      </Secao>

      <Secao titulo="sincronia do destaque">
        <div className="flex flex-wrap gap-2">
          {SINCRONIAS.map((s) => (
            <BotaoDeGrupo
              key={s.id}
              ativo={motion.sync === s.id}
              onClick={() => atualizar({ sync: s.id })}
              dica={s.dica}
              desabilitado={s.exigeTiming && !temTimingPorPalavra}
            >
              {s.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
        {dicaDaSincronia && <span className="text-[11px] text-ink-3">{dicaDaSincronia}</span>}
        {!temTimingPorPalavra && (
          <span className="text-[11px] text-ink-3">
            Esta letra tem tempo por verso, não por palavra — só a sincronia por linha se aplica.
            Transcrever pela IA gera o tempo por palavra.
          </span>
        )}
      </Secao>
    </div>
  );
}
