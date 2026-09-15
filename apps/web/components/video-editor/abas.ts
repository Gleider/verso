/** As sete abas do editor, na ordem da barra lateral. */
import {
  ArrowsPointingOutIcon,
  LanguageIcon,
  PhotoIcon,
  RectangleGroupIcon,
  SparklesIcon,
  SignalIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";

export type AbaId =
  | "background"
  | "font"
  | "motion"
  | "structure"
  | "style"
  | "visualizer"
  | "templates";

export interface DefinicaoDeAba {
  id: AbaId;
  rotulo: string;
  /** Heroicon 24/outline. A barra é estreita; o ícone carrega o reconhecimento. */
  Icone: ComponentType<SVGProps<SVGSVGElement>>;
  /** Vira `title` no botão: o rótulo de uma palavra não diz o que a aba faz. */
  dica: string;
}

export const ABAS: DefinicaoDeAba[] = [
  {
    id: "background",
    rotulo: "Background",
    Icone: PhotoIcon,
    dica: "Fundo: imagem, biblioteca ou cor, mais movimento e gradação de cor",
  },
  {
    id: "font",
    rotulo: "Font",
    Icone: LanguageIcon,
    dica: "Fonte: família, corpo, peso, alinhamento e efeitos do texto",
  },
  {
    id: "motion",
    rotulo: "Motion",
    Icone: ArrowsPointingOutIcon,
    dica: "Movimento: como o texto entra, sai e acompanha o canto",
  },
  {
    id: "structure",
    rotulo: "Structure",
    Icone: RectangleGroupIcon,
    dica: "Estrutura: onde a letra fica na tela e quantos versos aparecem",
  },
  {
    id: "style",
    rotulo: "Style",
    Icone: SparklesIcon,
    dica: "Estilo: combinações prontas, cores e efeitos de vídeo",
  },
  {
    id: "visualizer",
    rotulo: "Visualizer",
    Icone: SignalIcon,
    dica: "Camadas que somam por cima: visualizador de áudio e partículas",
  },
  {
    id: "templates",
    rotulo: "Templates",
    Icone: Squares2X2Icon,
    dica: "Templates: um ponto de partida completo em um clique",
  },
];
