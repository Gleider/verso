"use client";

import { familiaPorId, FONTES, pesoEhFixo } from "@/composition/fonts";
import { ESCALA_MAXIMA, ESCALA_MINIMA, TIPOGRAFIA } from "@/composition/formato";
import type { AlignH, FontSize } from "@/composition/settings";
import type { VideoSettings } from "@/lib/types";
import { BotaoDeGrupo } from "./BotaoDeGrupo";
import { comoPorcento, Deslizador, Interruptor, Secao } from "./Controles";

interface Props {
  settings: VideoSettings;
  onChange: (settings: VideoSettings) => void;
}

const TAMANHOS: { id: FontSize; rotulo: string }[] = [
  { id: "small", rotulo: "Pequena" },
  { id: "medium", rotulo: "Média" },
  { id: "large", rotulo: "Grande" },
];

/** `justify` saiu: a letra é de uma a duas linhas, e justificar não fazia nada. */
const ALINHOS: { id: AlignH; rotulo: string }[] = [
  { id: "left", rotulo: "Esquerda" },
  { id: "center", rotulo: "Centro" },
  { id: "right", rotulo: "Direita" },
];

/** Aba Font: família, corpo, peso, alinhamento e os efeitos do texto. */
export function PainelFont({ settings, onChange }: Props) {
  const { font } = settings;
  const familia = familiaPorId(font.family);
  const pesoFixo = pesoEhFixo(familia);
  const tipografia = TIPOGRAFIA[settings.output.aspectRatio];

  function atualizar(parcial: Partial<VideoSettings["font"]>) {
    onChange({ ...settings, font: { ...font, ...parcial } });
  }

  function escolherFamilia(id: VideoSettings["font"]["family"]) {
    const nova = familiaPorId(id);
    // O peso salvo pode estar fora do eixo desta família — trazê-lo para
    // dentro aqui é o que impede o controle de parecer travado depois.
    atualizar({
      family: id,
      weight: Math.min(nova.pesoMax, Math.max(nova.pesoMin, font.weight)),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Secao titulo="família">
        <div className="grid grid-cols-2 gap-2">
          {FONTES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => escolherFamilia(f.id)}
              style={{ fontFamily: `"${f.family}", ${f.fallback}` }}
              className={`flex flex-col items-center gap-1 border px-3 py-2 transition-colors ${
                font.family === f.id
                  ? "border-amber text-amber"
                  : "border-line text-ink-2 hover:border-amber hover:text-amber"
              }`}
            >
              <span className="text-xl leading-none">Aa</span>
              <span className="font-mono text-[10px] text-ink-3">{f.rotulo}</span>
            </button>
          ))}
        </div>
      </Secao>

      <Secao titulo="corpo">
        <div className="flex flex-wrap gap-2">
          {TAMANHOS.map((t) => (
            <BotaoDeGrupo key={t.id} ativo={font.size === t.id} onClick={() => atualizar({ size: t.id })}>
              {t.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
        <Deslizador
          rotulo="ajuste fino"
          valor={font.escala}
          min={ESCALA_MINIMA}
          max={ESCALA_MAXIMA}
          step={0.05}
          onChange={(escala) => atualizar({ escala })}
          formatar={(v) => `${Math.round(tipografia.tamanho[font.size] * v)}px`}
        />
        <Deslizador
          rotulo="peso"
          valor={font.weight}
          min={familia.pesoMin}
          max={familia.pesoMax}
          step={familia.pesoMin === familia.pesoMax ? 1 : 10}
          onChange={(weight) => atualizar({ weight })}
          desabilitado={pesoFixo}
          dica={pesoFixo ? `${familia.rotulo} tem um peso só.` : undefined}
        />
        <Deslizador
          rotulo="entrelinha"
          valor={font.lineHeight}
          min={0.8}
          max={2}
          step={0.05}
          onChange={(lineHeight) => atualizar({ lineHeight })}
          formatar={(v) => v.toFixed(2)}
        />
        <Deslizador
          rotulo="espaço entre letras"
          valor={font.espacamento}
          min={-8}
          max={40}
          step={1}
          onChange={(espacamento) => atualizar({ espacamento })}
          formatar={(v) => `${v}px`}
        />
        <Interruptor
          rotulo="caixa alta"
          ligado={font.uppercase}
          onChange={(uppercase) => atualizar({ uppercase })}
        />
      </Secao>

      <Secao titulo="alinhamento">
        <div className="flex flex-wrap gap-2">
          {ALINHOS.map((a) => (
            <BotaoDeGrupo key={a.id} ativo={font.alignH === a.id} onClick={() => atualizar({ alignH: a.id })}>
              {a.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
      </Secao>

      <Secao titulo="efeitos do texto">
        <Deslizador
          rotulo="sombra"
          valor={font.sombra}
          min={0}
          max={1}
          step={0.01}
          onChange={(sombra) => atualizar({ sombra })}
          formatar={comoPorcento}
        />
        <Deslizador
          rotulo="contorno"
          valor={font.contorno}
          min={0}
          max={1}
          step={0.01}
          onChange={(contorno) => atualizar({ contorno })}
          formatar={comoPorcento}
        />
        <Deslizador
          rotulo="brilho"
          valor={font.brilho}
          min={0}
          max={1}
          step={0.01}
          onChange={(brilho) => atualizar({ brilho })}
          formatar={comoPorcento}
          dica="Usa a cor do texto cantado da paleta escolhida."
        />
      </Secao>
    </div>
  );
}
