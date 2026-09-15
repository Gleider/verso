/**
 * As texturas que NÃO precisam de shader.
 *
 * O critério é um só: **o efeito amostra os pixels vizinhos?** Retícula,
 * aberração cromática e distorção de lente amostram — só saem em shader.
 * Grão, sépia, vinheta e poeira não: são filtro de cor sobre cada pixel, ou
 * uma camada desenhada por cima. O navegador faz as duas coisas no
 * compositor, na GPU, **sem custo por quadro** — enquanto a cadeia de shaders
 * roda a cada quadro segurando o quadro com `delayRender`.
 *
 * Quando a textura escolhida está aqui, `layers/Fundo.tsx` não monta canvas
 * nenhum: o fundo volta a ser um `<div>` ou um `<Img>` comum. Esse é o
 * caminho padrão do editor, e é o que faz o preview voltar a correr solto.
 *
 * Funções puras do tempo, como todo o resto de `composition/`: nada de
 * `Math.random`, nada de estado entre quadros.
 */
import type { CSSProperties } from "react";
import { hash } from "../aleatorio";
import type { TextureId } from "../settings";

/** Mesmo ruído de `app/globals.css` (.fx-noise): SVG embutido, sem requisição. */
const RUIDO_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.85'/%3E%3C/svg%3E";

/** Poeira: manchas esparsas em vez de grão fino — frequência baixa, contraste alto. */
const POEIRA_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.02' numOctaves='2'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='0 0 0 0 0 0 0 1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23p)'/%3E%3C/svg%3E";

export type EstadoCss = {
  /** Vai no `filter` da camada do fundo, junto com a gradação de cor. */
  filtro: string;
  /** Camadas desenhadas por cima do fundo, na ordem. */
  camadas: CSSProperties[];
};

export type TexturaCss = {
  id: TextureId;
  rotulo: string;
  descricao: string;
  estado: (ms: number, intensidade: number, pulso: number) => EstadoCss;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const faixa = (minimo: number, maximo: number, i: number) =>
  minimo + (maximo - minimo) * clamp(i, 0, 1);

/** Troca ~30x por segundo: rápido o bastante para parecer grão de filme. */
const BLOCO_MS = 33;

function deslocamentoDoGrao(ms: number, amplitude: number) {
  const bloco = Math.floor(ms / BLOCO_MS);
  return {
    x: (hash(bloco) - 0.5) * amplitude,
    y: (hash(bloco * 1.7) - 0.5) * amplitude,
  };
}

function camadaDeRuido(opacidade: number, deslocamento: { x: number; y: number }): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    backgroundImage: `url("${RUIDO_SVG}")`,
    backgroundRepeat: "repeat",
    backgroundPosition: `${deslocamento.x.toFixed(2)}px ${deslocamento.y.toFixed(2)}px`,
    mixBlendMode: "overlay",
    opacity: opacidade,
    pointerEvents: "none",
  };
}

function camadaDeVinheta(opacidade: number, raio: number): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    backgroundImage: `radial-gradient(ellipse at center, transparent ${raio}%, rgba(0,0,0,0.95) 100%)`,
    opacity: opacidade,
    pointerEvents: "none",
  };
}

const SEM_EFEITO: EstadoCss = { filtro: "none", camadas: [] };

export const TEXTURAS_CSS: TexturaCss[] = [
  {
    id: "none",
    rotulo: "Nenhuma",
    descricao: "A imagem como ela é.",
    estado: () => SEM_EFEITO,
  },
  {
    id: "grain",
    rotulo: "Granulado",
    descricao: "Grão de filme, trocando a cada quadro.",
    estado: (ms, intensidade) => ({
      // O ruído em `overlay` achata o contraste; sem compensar, "granulado"
      // só deixa a imagem cinzenta.
      filtro: `contrast(${faixa(1.02, 1.2, intensidade).toFixed(3)})`,
      camadas: [
        camadaDeRuido(
          faixa(0.08, 0.45, intensidade),
          deslocamentoDoGrao(ms, faixa(8, 40, intensidade)),
        ),
      ],
    }),
  },
  {
    id: "sepia",
    rotulo: "Sépia",
    descricao: "Cor lavada para o marrom, como foto velha.",
    estado: (ms, intensidade) => ({
      // `sepia()` é filtro nativo do CSS e faz exatamente isto. A tentativa
      // de imitá-lo com `temperature` de shader deixava o meio da imagem
      // ainda azulado — o navegador acerta de graça o que o shader errava.
      filtro: [
        `sepia(${faixa(0.5, 1, intensidade).toFixed(3)})`,
        `saturate(${faixa(0.9, 1.4, intensidade).toFixed(3)})`,
        `contrast(${faixa(1.05, 1.3, intensidade).toFixed(3)})`,
      ].join(" "),
      camadas: [
        camadaDeRuido(faixa(0.04, 0.16, intensidade), deslocamentoDoGrao(ms, 12)),
        camadaDeVinheta(faixa(0.2, 0.55, intensidade), 62),
      ],
    }),
  },
  {
    id: "vignette",
    rotulo: "Vinheta",
    descricao: "Escurecimento nas bordas, foco no centro.",
    estado: (_ms, intensidade) => ({
      filtro: "none",
      camadas: [camadaDeVinheta(faixa(0.35, 0.95, intensidade), faixa(60, 30, intensidade))],
    }),
  },
  {
    id: "dust",
    rotulo: "Poeira",
    descricao: "Sujeira e riscos de projeção, aparecendo e sumindo.",
    estado: (ms, intensidade) => {
      const bloco = Math.floor(ms / 120);
      return {
        filtro: "none",
        camadas: [
          {
            position: "absolute",
            inset: 0,
            backgroundImage: `url("${POEIRA_SVG}")`,
            backgroundRepeat: "repeat",
            // Salta de posição em blocos: é o que faz a sujeira "pular" como
            // num projetor, em vez de deslizar.
            backgroundPosition: `${(hash(bloco) * 300).toFixed(0)}px ${(hash(bloco * 2.3) * 300).toFixed(0)}px`,
            opacity: faixa(0.06, 0.3, intensidade),
            mixBlendMode: "screen",
            pointerEvents: "none",
          },
          camadaDeRuido(faixa(0.03, 0.12, intensidade), deslocamentoDoGrao(ms, 10)),
        ],
      };
    },
  },
  {
    id: "monocromatico",
    rotulo: "Preto e branco",
    descricao: "Tira a cor inteira, com contraste de cópia antiga.",
    estado: (_ms, intensidade) => ({
      filtro: [
        `grayscale(${faixa(0.7, 1, intensidade).toFixed(3)})`,
        `contrast(${faixa(1.05, 1.45, intensidade).toFixed(3)})`,
      ].join(" "),
      camadas: [],
    }),
  },
];

const POR_ID = new Map(TEXTURAS_CSS.map((t) => [t.id, t]));

/** A textura CSS deste id, ou `null` quando ela é de shader (ou não existe). */
export function texturaCssPorId(id: TextureId): TexturaCss | null {
  return POR_ID.get(id) ?? null;
}

/** true quando a textura escolhida dispensa canvas — o caminho barato. */
export function ehTexturaCss(id: TextureId): boolean {
  return POR_ID.has(id);
}

export const ESTADO_CSS_NEUTRO = SEM_EFEITO;
