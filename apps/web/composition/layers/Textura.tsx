import { AbsoluteFill } from "remotion";
import type { EstadoCss } from "../efeitos/texturas-css";

/**
 * As camadas de superfície da textura CSS, por cima do fundo e abaixo da letra.
 *
 * O `filtro` do estado NÃO vem para cá: ele é do fundo, e `layers/Fundo.tsx`
 * o aplica junto com a gradação de cor. Aqui só entram as sobreposições — grão,
 * poeira, vinheta —, que o navegador compõe na GPU sem custo por quadro.
 */
export function Textura({ estado }: { estado: EstadoCss }) {
  if (estado.camadas.length === 0) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {estado.camadas.map((camada, indice) => (
        <div key={indice} style={camada} />
      ))}
    </AbsoluteFill>
  );
}
