import { AbsoluteFill } from "remotion";
import { familiaPorId, pesoSuportado, pilhaDeFonte } from "../fonts";
import { tamanhoDaLetra, TIPOGRAFIA } from "../formato";
import { modoDeMovimento } from "../motion";
import type { EntradaDeSegmento, EntradaDeVerso, ModoDeMovimento } from "../motion";
import { coresDoTexto } from "../palettes";
import { posicaoNoVerso } from "../preenchimento";
import { efeitosDeTexto } from "../texto";
import { indiceDoVersoAtivo, segmentosNaGranularidade } from "../versos";
import { Verso } from "./Verso";
import type { AspectRatio, VideoSettings } from "../settings";
import type { VersoPreparado } from "../versos";

type Props = {
  settings: VideoSettings;
  versos: VersoPreparado[];
  ms: number;
  pulso: number;
  /** Só usada pelo modo `mask`, que recorta esta imagem com o texto. */
  backgroundUrl: string | null;
};

const JUSTIFICAR_VERTICAL: Record<VideoSettings["structure"]["lyricsPosition"], React.CSSProperties> = {
  top: { justifyContent: "flex-start", paddingTop: "10%", paddingBottom: 0 },
  center: { justifyContent: "center", paddingTop: 0, paddingBottom: 0 },
  bottom: { justifyContent: "flex-end", paddingTop: 0, paddingBottom: "10%" },
};

const MAXIMO_DE_VIZINHOS = 3;

/**
 * Quanto tempo o verso fica NA TELA — que não é a duração cantada.
 *
 * O verso continua visível até o próximo começar; `fimMs` é só quando a
 * última sílaba termina. Usar `fimMs` aqui fazia a animação de saída terminar
 * no meio do intervalo e o texto **sumia por completo** até o verso seguinte
 * entrar — era esse o defeito de "animar também a saída".
 */
function tempoEmCena(versos: VersoPreparado[], indice: number): number {
  const atual = versos[indice];
  const proximo = versos[indice + 1];
  const fim = proximo ? proximo.inicioMs : atual.fimMs + 1_200;
  return Math.max(1, fim - atual.inicioMs);
}

/**
 * O estado de repouso do modo, para os versos vizinhos.
 *
 * Eles não estão entrando nem saindo — mas também não podem ficar parados
 * enquanto o verso do meio se mexe. Pedir o estilo com o tempo já assentado
 * dá exatamente isso: sem animação de entrada, com a deriva contínua do
 * `tweak` e com a fase própria do índice, que é o que faz cada linha flutuar
 * por conta.
 */
function estiloDeVizinho(modo: ModoDeMovimento, base: EntradaDeVerso, indiceDoVerso: number) {
  return modo.verso({
    ...base,
    indiceDoVerso,
    msNoVerso: base.entradaMs,
    duracaoMs: base.entradaMs * 4,
    saida: false,
  });
}

/** Posiciona a letra na tela, escolhe o verso ativo e aplica o modo de movimento. */
export function Letra({ settings, versos, ms, pulso, backgroundUrl }: Props) {
  const indice = indiceDoVersoAtivo(versos, ms);
  if (indice < 0) return null;

  const aspectRatio: AspectRatio = settings.output.aspectRatio;
  const tipografia = TIPOGRAFIA[aspectRatio];
  const familia = familiaPorId(settings.font.family);
  const paleta = coresDoTexto(settings.style);
  const modo = modoDeMovimento(settings.motion.animation);

  const tamanho = tamanhoDaLetra(settings);
  const peso = pesoSuportado(familia, settings.font.weight);
  const pilha = pilhaDeFonte(familia);
  const efeitos = efeitosDeTexto(settings.font, paleta, tamanho);

  const atual = versos[indice];
  const quantosVizinhos = Math.min(MAXIMO_DE_VIZINHOS, Math.max(0, Math.round(settings.structure.vizinhos)));
  const opacidadeVizinhos = Math.min(1, Math.max(0, settings.structure.opacidadeVizinhos));

  const entradaDeVerso: EntradaDeVerso = {
    msNoVerso: ms - atual.inicioMs,
    duracaoMs: tempoEmCena(versos, indice),
    entradaMs: settings.motion.durationMs,
    msAbsoluto: ms,
    pulso,
    tweak: settings.motion.tweak,
    indiceDoVerso: indice,
    intensidade: settings.motion.intensidade,
    saida: settings.motion.saida,
  };
  const estiloDoVerso = modo.verso(entradaDeVerso);

  const segmentosResolvidos = segmentosNaGranularidade(atual, settings.motion.sync);
  const { indiceAtual, preenchimento } = posicaoNoVerso(segmentosResolvidos, ms);
  const segmentosEstilizados = segmentosResolvidos.map((segmento, indiceDoSegmento) => {
    const entradaDeSegmento: EntradaDeSegmento = {
      ...entradaDeVerso,
      indice: indiceDoSegmento,
      total: segmentosResolvidos.length,
      indiceAtual,
      preenchimento,
    };
    return { texto: segmento.texto, estilo: modo.segmento(entradaDeSegmento) };
  });

  /** Um vizinho: mesma fonte, mesmos efeitos, só mais apagado. */
  function vizinho(deslocamento: number) {
    const i = indice + deslocamento;
    if (i < 0 || i >= versos.length) return null;
    const estilo = estiloDeVizinho(modo, entradaDeVerso, i);
    // Verso que já passou aparece na cor de cantado; o que vem, na de por
    // cantar. É a leitura natural de uma letra rolando.
    const cheio = deslocamento < 0 ? 1 : 0;
    return (
      <Verso
        key={versos[i].id}
        segmentos={[{ texto: versos[i].texto, estilo: { preenchimento: cheio, opacity: 1, transform: "none" } }]}
        estiloDoVerso={{ ...estilo, opacity: estilo.opacity * opacidadeVizinhos }}
        paleta={paleta}
        fontSize={tamanho}
        fontWeight={peso}
        fontFamily={pilha}
        lineHeight={settings.font.lineHeight}
        alignH={settings.font.alignH}
        uppercase={settings.font.uppercase}
        larguraMaxima={tipografia.larguraMaxima}
        efeitos={efeitos}
        backgroundUrl={backgroundUrl}
      />
    );
  }

  const anteriores = Array.from({ length: quantosVizinhos }, (_, k) => vizinho(-(quantosVizinhos - k)));
  const proximos = Array.from({ length: quantosVizinhos }, (_, k) => vizinho(k + 1));

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        // `stretch`, não `center`: a caixa do verso precisa ocupar a largura
        // toda para `textAlign` ter espaço onde alinhar.
        alignItems: "stretch",
        paddingLeft: tipografia.margemLateral,
        paddingRight: tipografia.margemLateral,
        ...JUSTIFICAR_VERTICAL[settings.structure.lyricsPosition],
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          width: "100%",
          // Folga suficiente para o verso do meio não encostar nos vizinhos
          // quando ele quebra em duas linhas — que é o caso comum em 9:16.
          gap: Math.round(tamanho * 0.5),
        }}
      >
        {anteriores}
        <Verso
          segmentos={segmentosEstilizados}
          estiloDoVerso={estiloDoVerso}
          paleta={paleta}
          fontSize={tamanho}
          fontWeight={peso}
          fontFamily={pilha}
          lineHeight={settings.font.lineHeight}
          alignH={settings.font.alignH}
          uppercase={settings.font.uppercase}
          larguraMaxima={tipografia.larguraMaxima}
          efeitos={efeitos}
          backgroundUrl={backgroundUrl}
        />
        {proximos}
      </div>
    </AbsoluteFill>
  );
}
