/**
 * Gradação de cor do fundo — em CSS, não em shader.
 *
 * Isto já foi shader (`colorCorrection`) e a troca foi um erro meu: saturação,
 * contraste, brilho, matiz e desfoque existem como `filter` nativo do CSS, o
 * navegador compõe na GPU **sem custo por quadro**, e o resultado é o mesmo.
 * Como shader, cada um virava passe de quadro inteiro numa cadeia que roda a
 * cada quadro, com `delayRender` segurando o preview.
 *
 * A regra que ficou: **só vira shader o que precisa AMOSTRAR os pixels** —
 * retícula, aberração cromática, distorção de lente, borrão radial. Ajuste de
 * cor não amostra nada, é uma função de cada pixel sobre si mesmo. Isso é
 * exatamente o que `filter` faz.
 */
import type { VideoSettings } from "../settings";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const perto = (valor: number, alvo: number) => Math.abs(valor - alvo) < 0.001;

/**
 * O `filter` do fundo, pronto para o `style`.
 *
 * `pulso` entra aqui e não só no movimento: brilho e saturação subindo no
 * grave é o que amarra a imagem à música quando o fundo é parado. Custa zero,
 * porque mudar uma string de `filter` não redesenha nada — o compositor do
 * navegador reaplica.
 */
export function filtroDeCor(background: VideoSettings["background"], pulso: number): string {
  const batida = clamp(pulso, 0, 1) * clamp(background.reacaoBatida, 0, 1);
  const partes: string[] = [];

  const saturacao = Math.max(0, background.saturacao * (1 + batida * 0.25));
  const brilho = Math.max(0, background.brilho * (1 + batida * 0.22));
  const contraste = Math.max(0, background.contraste);

  if (!perto(saturacao, 1)) partes.push(`saturate(${saturacao.toFixed(3)})`);
  if (!perto(contraste, 1)) partes.push(`contrast(${contraste.toFixed(3)})`);
  if (!perto(brilho, 1)) partes.push(`brightness(${brilho.toFixed(3)})`);
  if (Math.abs(background.matiz) > 0.5) partes.push(`hue-rotate(${Math.round(background.matiz)}deg)`);
  if (background.blur > 0) partes.push(`blur(${background.blur}px)`);

  return partes.length > 0 ? partes.join(" ") : "none";
}

/** Junta filtros CSS, descartando os neutros. */
export function combinarFiltros(...filtros: string[]): string {
  const uteis = filtros.filter((f) => f && f !== "none");
  return uteis.length > 0 ? uteis.join(" ") : "none";
}
