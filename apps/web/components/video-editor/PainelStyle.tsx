"use client";

import { CATALOGO_DE_TEXTURAS, itemDeTextura } from "@/composition/efeitos/catalogo";
import { aplicarCombinacao, COMBINACOES } from "@/composition/estilos";
import { coresDoTexto, PALETAS } from "@/composition/palettes";
import type { OverlayId } from "@/composition/settings";
import type { VideoSettings } from "@/lib/types";
import { BotaoDeGrupo } from "./BotaoDeGrupo";
import { comoPorcento, Deslizador, Secao } from "./Controles";

interface Props {
  settings: VideoSettings;
  onChange: (settings: VideoSettings) => void;
}

const OVERLAYS: { id: OverlayId; rotulo: string }[] = [
  { id: "none", rotulo: "Nenhum" },
  { id: "scrim-bottom", rotulo: "Véu inferior" },
  { id: "scrim-full", rotulo: "Véu completo" },
  { id: "vignette", rotulo: "Vinheta" },
];

/**
 * `<input type="color">` só aceita `#rrggbb`.
 *
 * As paletas guardam `rgba(...)` porque o texto por cantar tem transparência;
 * passar isso direto para o input o deixa preto, e o usuário via a cor errada
 * no seletor antes mesmo de mexer nele.
 */
function corSolida(valor: string): string {
  if (valor.startsWith("#")) return valor.slice(0, 7);
  const n = valor.match(/[\d.]+/g);
  if (!n || n.length < 3) return "#ffffff";
  const hex = (v: string) => Math.round(Number(v)).toString(16).padStart(2, "0");
  return `#${hex(n[0])}${hex(n[1])}${hex(n[2])}`;
}

/** Aba Style: combinações prontas e, abaixo, cada peça em separado. */
export function PainelStyle({ settings, onChange }: Props) {
  const { style } = settings;
  const cores = coresDoTexto(style);

  function atualizar(parcial: Partial<VideoSettings["style"]>) {
    onChange({ ...settings, style: { ...style, ...parcial } });
  }

  return (
    <div className="flex flex-col gap-6">
      <Secao titulo="combinações">
        <div className="grid grid-cols-2 gap-2">
          {COMBINACOES.map((c) => {
            // Uma combinação está "ativa" quando as quatro peças de superfície
            // batem — mexer num deslizador depois solta a seleção, que é o
            // sinal honesto de que o visual já não é exatamente o dela.
            const ativa =
              style.palette === c.style.palette &&
              style.texture === c.style.texture &&
              style.overlay === c.style.overlay;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange(aplicarCombinacao(settings, c))}
                title={c.descricao}
                className={`flex items-center gap-2 border px-3 py-2 text-left transition-colors ${
                  ativa ? "border-amber" : "border-line hover:border-amber"
                }`}
              >
                <span
                  className="h-4 w-4 shrink-0 rounded-full"
                  style={{ backgroundColor: c.amostra }}
                />
                <span className={`font-mono text-[11px] ${ativa ? "text-amber" : "text-ink-2"}`}>
                  {c.rotulo}
                </span>
              </button>
            );
          })}
        </div>
      </Secao>

      <Secao titulo="cores do texto">
        <div className="grid grid-cols-3 gap-2">
          {PALETAS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => atualizar({ palette: p.id })}
              className={`flex flex-col items-center gap-1 border p-2 transition-colors ${
                style.palette === p.id ? "border-amber" : "border-line hover:border-amber"
              }`}
            >
              <span className="font-display text-lg font-bold" style={{ color: p.sung }}>
                a
              </span>
              <span className="font-mono text-[10px] text-ink-3">{p.rotulo}</span>
            </button>
          ))}
        </div>

        {/* Seleção livre: manda na paleta enquanto estiver preenchida. Fica
            aqui embaixo, e não substituindo os cartões, porque a paleta
            continua sendo o caminho rápido. */}
        <div className="flex flex-wrap items-center gap-4 pt-1">
          <label className="flex items-center gap-2 text-xs text-ink-2">
            <input
              type="color"
              value={corSolida(cores.sung)}
              onChange={(e) => atualizar({ corCantada: e.target.value })}
              className="h-8 w-10 border border-line bg-surface"
            />
            cantado
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-2">
            <input
              type="color"
              value={corSolida(cores.unsung)}
              onChange={(e) => atualizar({ corPorCantar: e.target.value })}
              className="h-8 w-10 border border-line bg-surface"
            />
            por cantar
          </label>
          {(style.corCantada !== null || style.corPorCantar !== null) && (
            <button
              type="button"
              onClick={() => atualizar({ corCantada: null, corPorCantar: null })}
              className="font-mono text-[11px] text-ink-3 underline hover:text-amber"
            >
              voltar para a paleta
            </button>
          )}
        </div>
      </Secao>

      <Secao titulo="efeito de vídeo">
        <div className="flex flex-wrap gap-2">
          {CATALOGO_DE_TEXTURAS.map((t) => (
            <BotaoDeGrupo
              key={t.id}
              ativo={style.texture === t.id}
              onClick={() => atualizar({ texture: t.id })}
              dica={
                t.tipo === "shader"
                  ? `${t.descricao} — roda na GPU a cada quadro, deixa o preview mais pesado.`
                  : t.descricao
              }
            >
              {t.rotulo}
              {t.tipo === "shader" && <span aria-hidden="true"> ·</span>}
            </BotaoDeGrupo>
          ))}
        </div>
        <span className="text-[11px] text-ink-3">
          {itemDeTextura(style.texture).descricao}
          {itemDeTextura(style.texture).tipo === "shader" && " (efeito pesado: o ponto no botão marca os que rodam na GPU a cada quadro)"}
        </span>
        {style.texture !== "none" && (
          <Deslizador
            rotulo="intensidade do efeito"
            valor={style.textureIntensity}
            min={0}
            max={1}
            step={0.01}
            onChange={(textureIntensity) => atualizar({ textureIntensity })}
            formatar={comoPorcento}
          />
        )}
      </Secao>

      <Secao titulo="véu de legibilidade">
        <div className="flex flex-wrap gap-2">
          {OVERLAYS.map((o) => (
            <BotaoDeGrupo key={o.id} ativo={style.overlay === o.id} onClick={() => atualizar({ overlay: o.id })}>
              {o.rotulo}
            </BotaoDeGrupo>
          ))}
        </div>
      </Secao>
    </div>
  );
}
