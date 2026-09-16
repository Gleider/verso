# Arquitetura

## A regra de fronteira

**Lógica de domínio nunca mora em `apps/`.**

`apps/api` e `apps/worker` traduzem protocolo: recebem HTTP ou um job, chamam
`packages/`, devolvem resposta. Se você está escrevendo uma decisão de negócio
dentro de um router, ela está no lugar errado.

No frontend a regra tem um espelho, e agora com **dois** lugares de lógica
pura: **`apps/web/lib/*.ts`** (sílabas, saneamento, detecção de batida) e
**`apps/web/composition/*.ts`** (tudo que a composição de vídeo decide —
settings, formato, movimento, textura). Componentes React e componentes `.tsx`
de `composition/` só aplicam o que essas funções devolvem. Se algo está
calculando, esse cálculo pertence a um `.ts`.

O que sobrou em `lib/` é pouco de propósito: `sync.ts` (sincronia do player
antigo) e `effects.ts` (o VHS/respiração de CSS) foram apagados quando o editor
de vídeo passou a ser a única definição do vídeo, e o que eles faziam vive hoje
em `composition/versos.ts`, `composition/preenchimento.ts`,
`composition/ambiente.ts` e `composition/efeitos/`. `syllables`, `normalize` e
`beat` são **importados só pela composição** — se um dia mais um deles perder o
último consumidor de fora, o lugar dele é dentro de `composition/`.

A exceção é `lib/rascunho.ts`, que é do **editor de letra**, não da composição:
ele guarda o que o editor decide antes de salvar — o tempo efetivo de cada
verso, a conversão de timecode, e a regra que diz se aquele estado pede uma
versão nova ou só um ajuste in-place (`oQueSalvar`). Está em `lib/` pelo mesmo
motivo de sempre: é decisão, e decisão não mora em componente.

Essa separação é o que permite testar o coração do produto sem banco, sem
navegador e sem áudio — e, desde o editor de vídeo, sem Chromium também.

## Pacotes

| Pacote | Responsabilidade | Não faz |
|---|---|---|
| `core` | Modelos SQLAlchemy, schemas Pydantic, config, storage, preparo de imagem (`images.py`) | nada de áudio, texto ou vídeo |
| `audio` | ffmpeg, metadados, Demucs | não conhece banco |
| `asr` | `Protocol` Transcriber + faster-whisper | não conhece banco |
| `lyrics` | versos, sílabas, saneamento, diff de timing, export, import .lrc, client Musixmatch | não conhece banco nem áudio |

Apenas `core` conhece o banco. Os demais recebem e devolvem dados simples — é
por isso que os testes deles não precisam de fixture de banco.

**`packages/video` não existe mais.** Ele desenhava o karaokê com Pillow e
compunha com ffmpeg; o editor de vídeo integrado (ver `domain.md` e
`docs/specs/2026-09-14 integrated-video-editor/spec.md`) substituiu esse
caminho inteiro por uma composição Remotion em `apps/web/composition/`. A
única peça de `packages/video` que sobreviveu — `prepare_background`, que
valida e normaliza a imagem enviada — mudou para `verso_core.images`, porque
nunca foi lógica de vídeo: é preparo de upload.

## Contratos, não implementações

`asr` expõe um `Protocol`, não uma classe concreta. Trocar faster-whisper por
uma API paga, ou pelo alinhamento forçado da fase 2, não deve tocar em nenhum
caso de uso. O mesmo vale para `StorageBackend` em `core/storage.py`: o disco
local é uma implementação, não a interface.

## Lógica compartilhada entre TS e Python

`apps/web/lib/syllables.ts`/`normalize.ts` e
`packages/lyrics/src/verso_lyrics/syllables.py`/`normalize.py` continuam
existindo nas duas linguagens — o alinhamento forçado da fase 2 roda em
Python e vai precisar da mesma silabificação.

**A regra do espelho foi rebaixada.** Antes desta mudança, uma divergência
entre as duas implementações significava "o vídeo exportado sai diferente do
player" — motivo pelo qual os testes eram espelhados caso a caso
(`syllables.test.ts` ↔ `test_syllables.py`), para a divergência aparecer como
falha, não como diferença visual sutil no vídeo.

Isso não é mais verdade: **o TypeScript de `composition/` é canônico para
tudo que é visual.** O vídeo exportado usa exatamente as mesmas
`normalizeWords`/`timeSyllables` do player, porque os dois rodam a mesma
composição. `apps/worker/src/verso_worker/versos.py` (Python) ainda existe e
ainda chama `verso_lyrics.normalize`/`syllables`, mas só como **preparo de
dados para o job** — a mesma convenção de deslocamento de
`composition/versos.ts`, não uma segunda implementação visual. Os testes
espelhados continuam valendo a pena (protegem a fase 2), mas a motivação
mudou: já não é "senão o vídeo diverge".

## Assíncrono desde o primeiro dia

Transcrever leva minutos. Nada disso cabe num request HTTP.

- `POST /tracks` responde `202` imediatamente com `track_id` e `job_id`.
- O trabalho pesado roda no worker (ARQ + Redis), um job por vez —
  Demucs e Whisper já ocupam a máquina inteira.
- O progresso vai ao banco (`processing_job.stage` e `progress`) e chega ao
  navegador por **SSE** (`GET /tracks/{id}/events`).

O render de vídeo usa o mesmo mecanismo, com `kind=render` e o caminho do
arquivo em `output_key`.

## O editor de vídeo integrado

Ver `docs/specs/2026-09-14 integrated-video-editor/spec.md` para o desenho
completo. Resumo do que existe:

- `video_project` (uma linha por faixa) guarda `settings` — um JSONB validado
  pelo schema Pydantic `VideoSettings` (`packages/core/src/verso_core/schemas.py`)
  e espelhado pelo tipo TypeScript `VideoSettings`
  (`apps/web/composition/settings.ts`). **Os nomes de campo são camelCase dos
  dois lados**, de propósito: este JSON atravessa API, banco e o Chromium do
  render sem nenhuma etapa de renomeação.
- Ajustar a aparência do vídeo **nunca cria versão de letra** — é a mesma
  regra do offset/nudge (`domain.md`): sobrescreve in-place.
- `apps/web/app/track/[id]/video/` é a tela do editor: `<Player>` do
  `@remotion/player` montando `composition/Karaoke.tsx`, com um painel por
  aba (Background, Font, Motion, Structure, Style, Templates).
- `output.aspectRatio` cobre quatro proporções, e o rótulo do painel traz o
  destino porque é assim que a escolha é feita: 16:9 (YouTube), 9:16 (TikTok,
  Reels, Shorts), 4:5 (feed do Instagram) e 1:1. O lado curto do espaço de
  design é **1080 em todas** — é isso que faz o fator de escala ser o mesmo, e
  é o que permite acrescentar um formato sem recalibrar nitidez (há teste).
- `output.recorte` (`{inicioMs, fimMs}` ou `null`) é o trecho que vira vídeo,
  para o corte de rede social. Ele **não muda a composição**: o preview usa
  `inFrame`/`outFrame` e o render usa `frameRange`, sobre a mesma linha do
  tempo da música inteira. Deslocar versos e áudio para o começo do trecho
  recriaria por outro caminho a divergência entre preview e MP4 que a
  composição única elimina, e poria o envelope da batida fora de fase — ele é
  construído sempre do quadro 0 (`pitfalls.md` §17). A tradução
  recorte → quadros é `composition/tempo.ts:janelaDeQuadros`, espelhada em
  `render.mjs` (que é `.mjs` e não pode importar o `.ts`).
- `apps/web/app/track/[id]/play/` monta a **mesma composição**, em tela cheia,
  com o ajuste de offset ao redor dela — não dentro.

## Como o vídeo é montado

**`apps/web/composition/` é a definição do vídeo — a única.** O mesmo
componente React (`Karaoke.tsx`) desenha o preview do editor
(`@remotion/player`, no navegador) e o MP4 exportado
(`@remotion/renderer`, num Chromium headless). Isso elimina por construção a
classe de defeito "ficou diferente no vídeo": não há duas implementações para
divergirem.

### CSS primeiro, shader só onde precisa

`apps/web/composition/efeitos/` é onde mora tudo que é **pixel**, e ele é
deliberadamente **híbrido**. A pergunta que decide de que lado uma coisa cai é
sempre a mesma:

> O efeito precisa **amostrar os pixels vizinhos**?

- **Não** → CSS. Gradação de cor (`cor.ts`, um `filter`), e as texturas de
  `texturas-css.ts` (grão, sépia, vinheta, poeira, preto e branco): um filtro
  ou uma camada por cima. O navegador compõe na GPU **sem custo por quadro**.
- **Sim** → shader. `texturas.ts` (retícula, VHS, tubo, cromático, estouro,
  borrão radial, pixelado) e os fundos gerados de `fundos.ts`, desenhados pelo
  GLSL de `composition/gl/`.

`layers/Fundo.tsx` decide com `precisaDeGl()`: **sem shader, nenhum canvas é
montado** — o fundo volta a ser um `<div>` ou um `<Img>`, e o preview fica em
60 fps cravados.

Isso não é preferência estética, é o custo do quadro, medido (`pitfalls.md`
§28). Já houve uma rodada em que *tudo* virou shader, inclusive a gradação de
cor: o preview caiu para menos de 10 fps, e o sépia ficou pior do que o
`filter: sepia()` nativo que ele substituiu.

O que o shader ganha de verdade é o que CSS não alcança: retícula que segue a
imagem, aberração cromática, distorção de lente, borrão radial. Esses valem o
canvas — e o painel marca quais são, para a conta ficar visível a quem escolhe.

### Como a camada de shader é montada

`composition/gl/` monta **um** fragment shader por combinação de fundo e
efeito, num contexto WebGL2 próprio, desenhado **síncrono** no
`useLayoutEffect`. Um efeito que amostra várias vezes (cromático, borrão
radial, retícula) chama a função do fundo de novo, em vez de precisar do
resultado numa textura intermediária.

Era isso que faltava: `@remotion/effects` dava um canvas **por efeito**, e
cada passe copiava 2 MP para o seguinte — medido em ~7 ms por passe, linear
(`pitfalls.md` §28). Com sete passes o preview caía de 60 para 31 fps.

Divisão dos arquivos, seguindo a regra de `.ts` puro e `.tsx` só aplicando:

| arquivo | papel |
|---|---|
| `gl/glsl/*.ts` | o GLSL, em constantes de string (webpack do Remotion não tem loader de `.glsl`) |
| `gl/fonte.ts` | monta o fonte da combinação; define quais fundos e efeitos existem |
| `gl/programa.ts` | compila e cacheia por combinação — recompilar por quadro custaria dezenas de ms |
| `gl/uniformes.ts` | `settings -> uniformes`, função pura e testável sem GPU |
| `gl/contexto.ts` | o contexto, o `drawArrays` |
| `gl/textura.ts` | a imagem de fundo como textura GL, cacheada por URL |
| `gl/particulas.ts` | o segundo contexto, transparente, das partículas |
| `layers/Tela.tsx` | o `.tsx` do canvas do fundo |
| `layers/Particulas.tsx` | o `.tsx` do canvas das partículas |

Consequências operacionais que **falham em silêncio**: o render precisa de
`gl: "swangle"` (`pitfalls.md` §27), o contexto precisa de
`preserveDrawingBuffer: true` (senão o MP4 sai em branco e o preview não),
e o hash de ruído dos exemplos da internet quebra em ANGLE (§29).

### As camadas que somam: visualizador e partículas

Textura é **superfície**: só uma vale por vez, e a escolhida substitui a
anterior. Visualizador de áudio e partículas não são isso — são **camadas**,
e somam. "Granulado + neve + barras" é um pedido legítimo, e o catálogo de
textura não tem como atendê-lo. Por isso as duas saíram da aba Style e têm
aba própria (`components/video-editor/PainelVisualizer.tsx`), com o ramo
`visualizer` e o ramo `particulas` no `VideoSettings`.

Cada uma escolhe se fica **atrás ou à frente da letra**, e quem aplica isso é
a ordem dos filhos em `Karaoke.tsx` — não há z-index disputando:

```
Fundo → Véu → [partículas atrás] → [visualizador atrás]
      → Letra → [visualizador à frente] → [partículas à frente]
```

O visualizador é **DOM puro** (barras com `transform: scaleY`, onda e
circular em SVG embutido): a geometria já é vetorial e não amostra pixel
nenhum, então cai do lado CSS da pergunta acima. As partículas são GLSL, num
contexto **transparente** próprio — é o preço de desenhar milhares de pontos
macios sem um nó de DOM por ponto.

As faixas do visualizador saem da **mesma FFT** do pulso da batida
(`audio/envelope.ts`), e não de uma segunda análise: a regra de uma só porta
para o áudio continua valendo (regra 5 abaixo). Mas a escala do pulso é
calibrada para o **detector de batida** (`pitfalls.md` §17) e não pode mudar,
então a exibição tem escala própria, em dois passos:

1. `audio/bandas.ts:normalizarParaExibicao()` guarda as faixas em **dB** e
   normaliza **por faixa, ao longo da música inteira** — cada faixa usa o
   próprio alcance (por isso reage), mas a altura máxima que alcança vem do
   nível absoluto dela (por isso faixa fraca continua parecendo fraca, em vez
   de virar chiado esticado até o teto).
2. `visualizador.ts:reagir()` dá o **contraste**, misturando um repouso com o
   sinal elevado a 1,8 conforme o controle de reação.

Os dois passos são necessários, e a medição diz por quê. Guardando as faixas
na escala do detector, **28% das amostras ficavam grudadas no teto** — era o
que deixava a linha da onda reta no meio, já que o centro dela é o grave. A
normalização derrubou isso para 7,6%, mas o movimento quadro a quadro ficou
igual (0,093 contra 0,088 de escala cheia): espalhar a escala tira o "reto",
não dá "reativo". O contraste é que separa pico de rotina.

As fotos da biblioteca (`public/fundos/`) são domínio público ou CC0, e só.
Ver `public/fundos/CREDITOS.md`: atribuição de CC BY teria de viajar dentro de
todo vídeo exportado, e não há onde colocá-la.

### Seis regras duras da composição

Todo arquivo sob `composition/` e `renderer/` segue isto, porque quebrá-las
**falha em silêncio** — ver `pitfalls.md`:

1. **Zero `className`.** O `bundle()` do Remotion não carrega
   `globals.css`/Tailwind; só `style={{}}` com valores de `composition/tokens.ts`.
2. **Zero `transition`/`animation` de CSS.** O preview roda na página do Next,
   sob `prefers-reduced-motion`; o render, não. Todo movimento é função de
   `useCurrentFrame()`.
3. **Só imports relativos.** O bundler do Remotion ignora `paths` do
   `tsconfig.json` — um `@/lib/...` aqui compila no Next e quebra só no
   primeiro render.
4. **Zero `Math.random` e zero estado entre quadros.** O Remotion renderiza
   quadros fora de ordem e em processos paralelos.
5. **Uma só porta para o áudio.** `composition/audio/useEnvelope.ts` é o
   único lugar que chama `useAudioData`/`getAudioData` — o cache interno do
   Remotion é indexado só pelo `src` e ignora as opções.
6. **Lógica pura em `.ts`, componentes em `.tsx`.** Os `.tsx` de `layers/`
   só escrevem `style`.

### Movimento da intensidade do efeito

`efeitos/movimento.ts` faz a intensidade do efeito respirar ao longo do tempo
(senoidal, deriva ou na batida). Existe porque intensidade fixa cansa: em dez
segundos o olho para de ver o efeito, e a saída óbvia — subir a intensidade —
é a que acaba cobrindo a letra.

É função **pura do relógio e do pulso**, como todo o resto da composição: a
deriva é soma de três senoides de períodos incomensuráveis, não ruído com
estado, porque o Remotion pede quadro fora de ordem (regra 4 abaixo).

Fica em `efeitos/` e não dentro de um dos caminhos porque vale para os
**dois**: `gl/uniformes.ts` (shader) e `layers/Fundo.tsx` (textura de CSS)
chamam a mesma função. O movimento só **tira** intensidade, nunca acrescenta —
o valor escolhido no painel continua sendo o teto do que se vê.

### O caminho do render

1. O worker (`apps/worker/src/verso_worker/video.py`) monta os versos
   (`versos.py`, espelhando `composition/versos.ts`), busca o `VideoSettings`
   de `video_project` (ou usa os padrões, se a faixa nunca abriu o editor) e
   chama `apps/web/renderer/render.mjs` como **subprocesso Node**.
2. `render.mjs` empacota a composição (`bundle()`, com cache por impressão
   digital em `storage/remotion-bundle`), mede a composição
   (`selectComposition()`) e renderiza (`renderMedia()`), emitindo **NDJSON**
   no stdout — uma linha por evento de progresso.
3. O worker lê o NDJSON e grava `stage`/`progress` no banco, com
   `stderr` drenado **em paralelo** (um cano cheio travaria o Node).
4. As props do vídeo carregam **URLs**, não caminhos de arquivo — as mesmas
   que o navegador usa (`INTERNAL_API_URL` dentro do Docker, onde
   `localhost` seria o próprio worker).

**O worker não leva o app do Next junto.** Ele precisa do bundler e do
Chromium, não de `next`, `@rspack`, `sharp` ou `typescript` — por isso
`apps/web/renderer/package.json` é um manifesto separado, declarando só o que o
render abre (194 MB instalados, contra 1,1 GB do manifesto do app). O
`Dockerfile.worker` instala esse, e copia do repositório apenas `composition/`,
`lib/`, `public/` e `renderer/`.

O preço são dois lugares declarando as versões do Remotion, e divergir ali seria
grave: o preview rodando numa versão e o MP4 saindo de outra recria por outro
caminho justamente a classe de defeito que a composição única elimina. Quem
segura isso é `renderer/__tests__/manifesto.test.ts` — ele falha se uma versão
divergir **e** se algum arquivo da composição passar a importar um pacote que o
manifesto do renderer não declara.

## Desempenho no player e no editor

O loop de animação do preview é o `useCurrentFrame()` do Remotion; fora dele
(barra de abas, forma de onda, painel), nada acompanha o relógio do vídeo —
só o `<Player>` re-renderiza por quadro, por design do Remotion.

Onde ainda existe laço próprio (o ajuste de offset ao redor do player), as
mesmas três regras de sempre valem:

1. **Estado do React só muda quando precisa** — não a cada quadro.
2. Escrita direta em `style`, sem passar pelo React, para o que muda por quadro.
3. **Busca binária** para achar o verso e o segmento atuais, nunca varredura
   (`composition/versos.ts:indiceDoVersoAtivo`,
   `composition/preenchimento.ts:posicaoNoVerso`).

## Onde ficam as coisas

```
CLAUDE.md                    entrada para agentes
.claude/rules/                regras detalhadas (este diretório)
docs/specs/                  plano técnico e decisões
tests/                       pytest — domínio Python
apps/web/lib/__tests__/      vitest — lógica pura do frontend
apps/web/composition/        a definição do vídeo (Remotion) — preview e render
apps/web/renderer/           script Node que grava o MP4 (render.mjs)
apps/api/migrations/         alembic
infra/                       docker compose e Dockerfiles
storage/                     dados locais — fora do git (inclui o cache do bundle)
```
