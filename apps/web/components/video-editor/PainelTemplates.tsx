"use client";

import { fundoPorId } from "@/composition/efeitos/fundos";
import { paletaPorId } from "@/composition/palettes";
import { TEMPLATES } from "@/composition/templates";
import type { VideoSettings } from "@/lib/types";
import { Secao } from "./Controles";

interface Props {
  currentSettings: VideoSettings;
  activeTemplateId: string | null;
  onApply: (settings: VideoSettings, templateId: string) => void;
}

/**
 * Aba Templates: aplica todas as configurações de uma vez, menos a imagem
 * enviada pelo usuário — a foto dele é dele. A tela mãe (`VideoEditor`)
 * guarda a configuração anterior para o botão "desfazer template".
 */
export function PainelTemplates({ activeTemplateId, onApply }: Props) {
  return (
    <Secao titulo="templates">
      <div className="grid grid-cols-2 gap-2">
        {TEMPLATES.map((template) => {
          const paleta = paletaPorId(template.settings.style.palette);
          const fundo = fundoPorId(template.settings.background.ref);
          const ativo = activeTemplateId === template.id;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onApply(template.settings, template.id)}
              title={template.descricao}
              className={`flex flex-col items-start gap-2 border p-2 text-left transition-colors ${
                ativo ? "border-amber" : "border-line hover:border-amber"
              }`}
            >
              <span
                className="flex h-14 w-full items-center justify-center overflow-hidden"
                style={{ background: fundo.amostra, backgroundColor: fundo.base }}
              >
                <span
                  className="font-display text-base font-bold"
                  style={{ color: paleta.sung }}
                >
                  Aa
                </span>
              </span>
              <span className="font-display text-sm text-ink">{template.rotulo}</span>
              <span className="font-mono text-[10px] leading-tight text-ink-3">
                {template.descricao}
              </span>
            </button>
          );
        })}
      </div>
    </Secao>
  );
}
