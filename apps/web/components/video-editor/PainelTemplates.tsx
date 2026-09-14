"use client";

import { TEMPLATES } from "@/composition/templates";
import { paletaPorId } from "@/composition/palettes";
import type { VideoSettings } from "@/lib/types";

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
    <div className="flex flex-col gap-3">
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
        templates
      </span>
      <div className="grid grid-cols-2 gap-2">
        {TEMPLATES.map((template) => {
          const paleta = paletaPorId(template.settings.style.palette);
          const ativo = activeTemplateId === template.id;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onApply(template.settings, template.id)}
              className={`flex flex-col items-start gap-2 border p-3 text-left transition-colors ${
                ativo ? "border-amber" : "border-line hover:border-amber"
              }`}
            >
              <span
                className="h-10 w-full"
                style={{
                  background: `linear-gradient(135deg, ${template.settings.background.color}, ${paleta.sung})`,
                }}
              />
              <span className="font-display text-sm text-ink">{template.rotulo}</span>
              <span className="font-mono text-[10px] text-ink-3">
                {template.settings.motion.animation} · {template.settings.style.texture}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
