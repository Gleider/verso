# Editor de vídeo integrado

**Data:** 2026-09-14 · **Estado:** implementado (etapas 0–7 do plano de
implementação). Duas decisões da spec mudaram na execução: `lib/beat.ts` NÃO
sobrevive intacto (§7 assumia isso incorretamente — a escala de
`visualizeAudio` exigiu tradução própria, ver `pitfalls.md` §17), e o ajuste
por verso (`nudge_ms`) não ganhou UI no player migrado (§9) — só o offset da
faixa inteira.
**Referência visual:** os `.png` desta pasta (criação de vídeo do Musixmatch Pro)

Substitui o botão "gerar 1080p" por uma tela de edição onde o vídeo é montado
olhando para ele, e não imaginando como vai ficar.

---

## 1. O que existe hoje, e por que não basta

O caminho atual do vídeo é um beco:

1. o usuário escolhe uma imagem de fundo e um efeito (`breathe`, `vhs`,
   `pulse`, `none`) na página da faixa;
2. clica em "gerar 1080p";
3. espera alguns minutos;
4. baixa o MP4 e descobre se gostou.

São três problemas empilhados:

**Não dá para ver antes.** O player (`KaraokePlayer.tsx`) e o render
(`verso_video/frames.py`) são dois programas diferentes desenhando a mesma
coisa. Eles se parecem porque alguém cuidou disso à mão, não porque
compartilhem código. O player usa CSS e `background-clip: text`; o render usa
Pillow e recorte de canal alfa. Já divergiram: o pulso da batida existe no
player e **não existe no vídeo exportado** — `render.py` não tem nenhum termo
que dependa do áudio.

**O catálogo de aparências é minúsculo.** Quatro efeitos, uma posição de letra,
uma fonte (a primeira que o sistema tiver, ver `FONT_CANDIDATES`) e duas cores
fixas em constantes Python. Não há como o usuário fazer um vídeo que pareça
dele.

**Cada aparência nova custa duas implementações.** Uma em CSS, outra em Pillow
ou em filtro de ffmpeg — e esta última esbarra na build mínima de ffmpeg da
máquina (`pitfalls.md` §3: sem `libass`, sem `drawtext`). Nove modos de
movimento do texto, oito texturas, posições e fontes: é uma matriz que não se
mantém escrita duas vezes.

O terceiro problema é o que decide a arquitetura desta spec.

---

## 2. A decisão central: um único desenho, dois consumos

**Preview e render passam a ser o mesmo código React, renderizado pelo mesmo
motor.** O que muda entre eles é só quem está olhando: no editor, o navegador
do usuário; na exportação, um Chromium sem tela dirigido pelo Remotion, que
entrega os quadros ao ffmpeg.

Isso acaba com a classe inteira de defeito "ficou diferente no vídeo". Não por
disciplina — por construção.

### Por que Remotion

| Alternativa | Por que não |
|---|---|
| **Manter Pillow + ffmpeg** | Cada aparência nova custa duas implementações, e as mais expressivas (máscara, desfoque, sombra, tipografia de verdade) são caras ou impossíveis em Pillow. A matriz desta spec torna isso inviável. |
| **Canvas/WebGL próprio capturado por Playwright** | É reconstruir o Remotion pela metade: paralelismo de quadros, mux de áudio, determinismo, progresso, retomada de falha. Meses de trabalho para chegar atrás. |
| **Filtros de ffmpeg (ASS/libass)** | A build local não tem `libass` nem `drawtext` (`pitfalls.md` §3). Mesmo com ela, tipografia e animação sairiam como aproximação do que o player faz, não como o mesmo desenho. |
| **Remotion** | Um componente React é a definição do vídeo. `@remotion/player` mostra no editor, `@remotion/renderer` grava. Mesma árvore, mesmo CSS, mesmas fontes. |

**Custos reais, assumidos:**

- O worker passa a precisar de **Node e de um Chromium headless** (~150 MB
  baixados uma vez, por `npx remotion browser ensure`). A imagem do worker
  cresce e o `Dockerfile.worker` precisa das bibliotecas de sistema do
  Chromium. Isso se soma ao que já é pesado ali (`pitfalls.md` §15).
- **Render em CPU.** Uma faixa de 3min30 a 30 fps são cerca de 6300 quadros.
  Com concorrência de 4 a 8 numa máquina de desktop, a ordem de grandeza é de
  minutos — comparável ao que o Pillow já leva, e o pipeline já é assíncrono
  por causa do Demucs. Não é regressão de experiência.
- **Licença.** O Remotion é gratuito para pessoas físicas e para empresas de
  até três pessoas, e exige licença comercial acima disso. Este projeto é de
  uso pessoal (ver `CLAUDE.md`), então está dentro. **Se um dia deixar de ser
  uso pessoal, esta decisão precisa ser revista** — é a única dependência do
  projeto com essa característica.

### O que isso apaga

`packages/video` deixa de existir. Com ele somem a expressão de zoom em
`zoompan`, a cadeia VHS escrita em `geq`, o cano de quadros RGBA e o log de
stderr em arquivo.

Some também a razão da duplicação TS↔Python descrita em `architecture.md`: hoje
`verso_lyrics.syllables` e `verso_lyrics.normalize` existem em Python **só**
porque `verso_video/frames.py` os chama — verificado, não há outro consumidor
de produção. Depois desta mudança, a silabificação do vídeo é a do TypeScript,
a mesma do player.

**Recomendação:** manter os módulos Python e seus testes, porque o alinhamento
forçado da fase 2 roda em Python e vai querer a mesma silabificação, mas
**rebaixar a regra do espelho**: o TypeScript passa a ser canônico para tudo
que é visual, e a divergência deixa de produzir defeito no vídeo.
`architecture.md` precisa ser corrigido junto com a implementação. *(Ponto a
confirmar antes do plano — ver §12.)*

---

## 3. Onde o código mora

A regra de fronteira do projeto continua valendo, e ganha um terceiro lado:

```
packages/composition/     ← NOVO. TypeScript. A definição do vídeo.
  src/
    Karaoke.tsx           composição Remotion, raiz de tudo que aparece
    settings.ts           tipo VideoSettings, padrões e validação
    templates.ts          os templates, como dado tipado
    motion/*.ts           um arquivo por modo de movimento — funções puras
    textures/*.tsx        um arquivo por textura — componentes determinísticos
    backgrounds.ts        catálogo da biblioteca de fundos
    fonts.ts              catálogo de fontes e carregamento
    __tests__/            vitest

apps/web/                 importa a composição e a mostra no @remotion/player
apps/renderer/            NOVO. Script Node que grava o MP4. Casca fina.
apps/worker/              chama o renderer por subprocesso, como já faz com o ffmpeg
```

`packages/composition` é um workspace npm, consumido por `apps/web` e por
`apps/renderer`. **Nenhuma decisão visual mora em `apps/`** — é a mesma regra
que já vale para `packages/` em Python, e o mesmo espírito de
`apps/web/lib/*.ts`: lógica pura e testada, componentes aplicam.

`apps/web/lib/sync.ts`, `syllables.ts`, `normalize.ts` e `beat.ts` continuam
onde estão e passam a ser importados pela composição. São fronteira de domínio
já testada; não há motivo para movê-los.

---

## 4. Modelo de dados

### Uma tabela nova: `video_project`

Uma faixa tem **um** projeto de vídeo. Não há multiusuário nem necessidade de
variações por faixa; quando houver, é remover a restrição de unicidade e
mostrar uma lista.

| Coluna | Tipo | Papel |
|---|---|---|
| `id` | UUID | |
| `track_id` | UUID, único | uma faixa, um projeto |
| `template_id` | text, nulo | de qual template veio, ou nulo se do zero |
| `settings` | JSONB | tudo que as abas configuram |
| `settings_version` | int | versão do formato de `settings` |
| `updated_at` | timestamptz | UTC, como o resto |

### Por que `settings` é JSONB e não vinte colunas

Porque o formato vai mudar muitas vezes enquanto o editor estiver sendo
desenhado, e uma migration por ajuste de aparência seria puro atrito. O
contrato não some por isso: **existe um schema Pydantic `VideoSettings` no
backend e um tipo `VideoSettings` em `packages/composition/settings.ts`**, e o
`PUT` valida contra ele. JSONB é o armazenamento, não a ausência de tipo.

`settings_version` é a saída para mudanças de formato: a leitura passa por uma
função de migração que traz projetos antigos para o formato corrente. Sai mais
barato que uma migration de banco e é testável sem banco.

### Forma de `settings`

```jsonc
{
  "background": {
    "kind": "upload",           // upload | library | cover | color
    "ref": "gradiente-petroleo", // id da biblioteca, nulo no upload
    "color": "#0C1316",
    "ambient": "breathe",       // breathe | pulse | drift | none
    "ambientIntensity": 0.55,
    "blur": 0,
    "darken": 0.35              // véu escuro sob o texto, para a letra ser legível
  },
  "font": {
    "family": "bricolage",
    "size": "medium",           // small | medium | large
    "weight": 700,
    "alignH": "center",         // left | center | right | justify
    "alignV": "middle",         // top | middle | bottom
    "uppercase": false,
    "lineHeight": 1.25
  },
  "motion": {
    "animation": "fill",        // ver §6.4
    "tweak": "none",            // none | floating
    "sync": "syllable",         // line | word | syllable
    "durationMs": 420
  },
  "structure": {
    "lyricsPosition": "center"  // top | center | bottom
  },
  "style": {
    "palette": "estudio",
    "texture": "none",          // none | grain | vhs | paper | sepia | dust | halftone | vignette
    "textureIntensity": 0.5,
    "overlay": "none"           // none | scrim-bottom | scrim-full | vignette
  },
  "output": {
    "resolution": "1080p",      // 720p | 1080p
    "fps": 30
  }
}
```

### Migração dos dados existentes

`track.background_effect` e `track.effect_intensity` hoje misturam duas coisas
que esta spec separa: **como a imagem se move** (`background.ambient`) e **como
ela parece** (`style.texture`). A migration cria um `video_project` por faixa
que tenha fundo, traduzindo:

| `background_effect` | vira |
|---|---|
| `breathe` | `ambient: "breathe"`, `texture: "none"` |
| `pulse` | `ambient: "pulse"`, `texture: "none"` |
| `vhs` | `ambient: "pulse"`, `texture: "vhs"` |
| `none` | `ambient: "none"`, `texture: "none"` |

As colunas antigas **ficam onde estão** por enquanto: o player de karaokê atual
(`/track/[id]/play`) continua lendo delas até ser migrado (§9). Removê-las é
limpeza para depois que o editor estiver de pé.

### O que não é versionado

Nada disto cria versão. A regra do projeto é clara e continua valendo: **versão
é sobre o que a letra diz** (`domain.md`). Aparência de vídeo é ajuste
contínuo, como o `nudge_ms` — grava in-place, com espera antes de gravar, igual
ao que `BackgroundPicker` já faz com o efeito.

---

## 5. A tela

### Estilo: Verso, não Musixmatch

Os `.png` desta pasta são referência de **estrutura e de vocabulário de
funcionalidade**, não de aparência. A identidade continua a de `globals.css`:
petróleo profundo (`--color-ground`), âmbar de VU meter como único acento,
Bricolage Grotesque no display, Source Serif no corpo, JetBrains Mono nos
rótulos técnicos. Nada de roxo, nada de botão "Finalize" com pedrinha, nada de
gradiente de marca.

Concretamente:

- barra lateral de abas em `--color-surface`, ícone e rótulo em
  `--color-ink-3`, aba ativa em `--color-amber` sobre `--color-surface-2`;
- painel da aba em `--color-surface`, divisórias em `--color-line-soft`;
- item selecionado (fonte, textura, template) com borda `--color-amber`, como
  os botões já fazem;
- rótulos de seção em mono, caixa alta e espaçamento largo — o padrão que
  `VideoExport.tsx` já usa em "exportar vídeo".

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ ← voltar   Título da faixa · artista            [exportar]   │
├────┬──────────────────┬──────────────────────────────────────┤
│ ab │                  │                                      │
│ as │  painel da aba   │        preview 16:9                  │
│    │  (abre e fecha)  │        (Remotion Player)             │
│ 🖼  │                  │                                      │
│ Aa │                  ├──────────────────────────────────────┤
│ ↻  │                  │  ▶  01:03 / 03:21          🔊  ⛶     │
│ ▭  │                  ├──────────────────────────────────────┤
│ ✦  │                  │  forma de onda e régua de tempo      │
│ ⊞  │                  │                                      │
└────┴──────────────────┴──────────────────────────────────────┘
```

O painel da aba **empurra** o preview em vez de cobri-lo. O Musixmatch cobre, e
em `background-1.png` dá para ver o preview cortado ao meio. Ver o resultado
inteiro enquanto se mexe no controle é o ponto da tela.

A forma de onda reaproveita `Waveform.tsx` e o wavesurfer que já está no
projeto, com a régua em segundos do print e o cursor arrastável.

### Entrada: template ou do zero

Na primeira vez que se abre o editor de uma faixa, a tela é a de
`select-template.png`: uma grade de templates com "criar" em cada um e "começar
do zero" no canto. Escolher grava o `video_project` e leva ao editor. Depois
disso a entrada vai direto ao editor, e os templates continuam acessíveis pela
aba.

---

## 6. As abas

Seis, na ordem da barra lateral. Cada uma escreve num ramo de `settings`, e o
preview reage no quadro seguinte.

### 6.1 Background

Três origens, como em `background-2.png`:

- **Envios** — o upload que já existe (`PUT /tracks/{id}/background`, com
  `prepare_background` validando ao abrir com Pillow, `pitfalls.md` §11).
  Continua igual.
- **Capa** — a arte embutida nas tags do arquivo, que o `mutagen` já lê na
  ingestão. Hoje é descartada; passa a ser um fundo de um clique. É o caminho
  mais curto para um vídeo com cara de coisa pronta.
- **Biblioteca** — fundos **gerados por código**, não arquivos: campos de cor,
  gradientes, ruído, linhas. Definidos em `backgrounds.ts` como componentes,
  com miniatura renderizada pela própria composição.

**Por que a biblioteca é procedural.** Empacotar fotos no repositório esbarra
em duas coisas: `storage/` está fora do git de propósito, e imagem de terceiro
traz licença para administrar num projeto que não tem essa ambição. Fundo
gerado são alguns kilobytes de código, escala para qualquer resolução sem
borrar e combina por construção com a paleta escolhida na aba de estilo.

Para quem quiser fotos próprias como biblioteca, a saída é uma pasta
`storage/backgrounds/library/` que a API lista, sem nada no repositório.

Ainda nesta aba, porque são decisões sobre a imagem e não sobre o texto:

- **movimento ambiente** (`breathe`, `pulse`, `drift`, `none`) e intensidade, que
  é o `effectFrame` de hoje com o nome corrigido;
- **desfoque** e **escurecimento**, que é o que torna letra clara legível sobre
  foto clara. Hoje não existe, e é um defeito à espera de acontecer.

**Sem geração por IA.** O projeto é local e sem nuvem (`CLAUDE.md`), então a
aba "AI Generations" do print fica de fora.

### 6.2 Font

Espelha `font.png`: família, tamanho (pequeno, médio, grande), alinhamento
horizontal e vertical. Mais peso e caixa alta, que aparecem nos templates da
referência e são baratos.

**As fontes são embutidas no pacote**, em WOFF2, e só de licença aberta (SIL
OFL). O motivo é duplo: o Chromium do render não tem as fontes do sistema do
usuário, e `find_font()` hoje já cai num fallback pobre quando não acha nada.
Um catálogo de oito famílias cobre o repertório da referência: uma grotesca de
display, uma serifada editorial, uma condensada, uma de máquina de escrever,
uma geométrica, uma pesada de cartaz, uma cursiva e a mono do projeto.

**Armadilha:** o Remotion precisa das fontes carregadas **antes** do primeiro
quadro, senão os primeiros segundos saem no fallback. Resolve-se com
`delayRender`/`continueRender` em volta de `document.fonts.ready`, e é caso para
`pitfalls.md` — falha calado e só aparece olhando o começo do vídeo.

### 6.3 Structure

Só **posição da letra**: topo, centro, rodapé. Foi o pedido explícito. Os outros
tipos de layout (`Subtitles`, `Cover`) e o `Format` do print ficam de fora.

O ramo `structure` existe mesmo com um campo só, para que acrescentar layout
depois não seja mudança de formato.

Nota: o render de hoje desenha apenas a faixa inferior da tela
(`LyricsLayer.height = height * 0.42`), porque desenhar tudo seria três vezes o
trabalho. Com o Remotion essa restrição some — o Chromium compõe a tela inteira
de qualquer forma —, e é por isso que "letra no centro" passa a ser possível.

### 6.4 Motion

Como o texto entra, sai e reage. Os modos de `motion.png`, adaptados:

| Modo | O que faz |
|---|---|
| `fill` | O karaokê de hoje: a cor avança dentro do verso. **É o padrão.** |
| `fade` | O verso aparece e some por opacidade. |
| `slide` | Entra deslizando lateralmente. |
| `wipe` | Revelado por uma máscara que varre o verso. |
| `popup` | Entra com um salto curto de escala. |
| `scaling` | Cresce enquanto está em cena. |
| `mask` | O texto recorta a imagem, sem cor de preenchimento. |
| `bubbling` | Palavras com deslocamento vertical alternado. |
| `static` | Aparece e fica. Sem animação de entrada. |

Mais o **ajuste** (`none` ou `floating`, uma deriva lenta contínua) e a
**granularidade do destaque**:

- `line` — o verso inteiro acende de uma vez;
- `word` — palavra a palavra, com `wordCursor` de `lib/sync.ts`;
- `syllable` — sílaba a sílaba, com `timeSyllables`. **É o padrão**, e é a
  coisa que este projeto faz que a referência não faz.

**Cada modo é uma função pura** `(msNoVerso, verso, settings) => estilo`, em
`motion/*.ts`, com teste. O componente aplica. É a regra de `architecture.md`
no lugar novo, e é o que permite testar nove animações sem navegador.

**Armadilha nova, e séria:** o Remotion renderiza quadros fora de ordem e em
paralelo. Qualquer animação que dependa de estado acumulado entre quadros, ou de
`Math.random`, produz vídeo inconsistente. Todo movimento tem que ser função do
tempo absoluto, e todo ruído tem que ser determinístico — exatamente como o
`hash()` de `lib/effects.ts` já faz. Isso é material de `pitfalls.md`.

### 6.5 Style

Duas listas, como em `style.png`.

**Paletas** — combinações nomeadas de quatro cores: texto por cantar, texto
cantado, contorno ou sombra, e véu de fundo. A primeira é a do Verso (âmbar
sobre petróleo, exatamente as `--kw-sung` e `--kw-unsung` de hoje) e as demais
partem dela. Há uma entrada "personalizada" com seletores de cor.

**Texturas** — o que dá superfície à imagem:

| Textura | O que é |
|---|---|
| `none` | Imagem limpa. |
| `grain` | Granulado fino, animado. |
| `vhs` | Linhas de varredura, separação de croma, falha de rastreamento. O efeito atual, portado. |
| `paper` | Papel amassado, luz irregular. |
| `sepia` | Vira monocromático quente. |
| `dust` | Poeira e riscos de filme velho. |
| `halftone` | Retícula de impressão. |
| `vignette` | Só o escurecimento das bordas. |

Com um controle de intensidade na mesma convenção que já existe: 0 quase
imperceptível, 1 assumidamente estilizado.

Vale repetir o que `pitfalls.md` §12 ensinou: **amplitude pequena demais é
indistinguível de efeito quebrado.** Cada textura precisa de um teste que fixe
um piso de amplitude visível, como o que já existe para o zoom.

O `overlay` (véu sob o texto) fica aqui, e não em Background, porque é decisão
de legibilidade do texto, não da imagem.

### 6.6 Templates

Um template é um `VideoSettings` completo, com nome e miniatura. Vive em
`templates.ts` **como código tipado**, não no banco: é conteúdo de produto, muda
junto com o código, e assim entra no `tsc` e nos testes.

A miniatura é um quadro da própria composição, renderizado com texto inventado,
e não uma imagem empacotada. A consequência boa: mexer numa textura atualiza
todas as miniaturas sozinho, sem ninguém lembrar de regerar PNG.

Aplicar um template **substitui todas as configurações, menos a imagem de fundo
enviada pelo usuário** — a foto dele é dele. A configuração anterior fica em
memória para um desfazer, porque trocar de template por curiosidade e perder
meia hora de ajuste é a pior coisa que esta tela pode fazer.

Nomes de partida: `Estúdio`, `Fita`, `Papel`, `Meia-noite`, `Contraluz`,
`Prensa`, `Aurora`, `Neon frio`. Todos com letra inventada nas miniaturas —
**letra real nunca entra no repositório** (`CLAUDE.md`).

---

## 7. Preview em tempo real

O centro da tela é um `<Player>` do `@remotion/player` montando a **mesma
composição que o render usa**, com as mesmas props.

### Áudio determinístico, e o que se ganha com isso

Hoje a reação à batida vem de um `AnalyserNode` lendo o áudio enquanto toca
(`KaraokePlayer.tsx`). Num render headless não há áudio tocando, e é por isso
que o vídeo exportado de hoje **não tem pulso nenhum**.

A composição passa a usar `@remotion/media-utils`: os dados do áudio são
decodificados uma vez e a amplitude de cada quadro é lida por índice. Isso é
determinístico, funciona igual no navegador e no render, e **faz o pulso da
batida finalmente existir no MP4**. Uma faixa de quatro minutos decodificada na
memória é da ordem de dezenas de megabytes, o que é aceitável e só acontece no
editor.

`lib/beat.ts` continua sendo quem transforma espectro em pulso. Muda a fonte do
espectro, não a regra.

### Custo por quadro

A regra de desempenho de `architecture.md` continua valendo, com uma ressalva:
dentro da composição o React re-renderiza a cada quadro por design do Remotion,
é assim que ele funciona. O que não pode acontecer é **o editor em volta**
re-renderizar junto. Painéis de aba, forma de onda e barra lateral são
independentes do relógio do preview; só o `<Player>` acompanha o tempo.

---

## 8. Exportação

### O caminho

```
POST /tracks/{id}/render         → job ARQ, como hoje (202 imediato)
  worker
    → subprocesso: node apps/renderer/render.mjs
        entrada: JSON no stdin (props, saída, resolução, fps)
        saída:   NDJSON no stdout — {"progress": 0.42}
    → grava o progresso no job, igual ao on_progress de hoje
    → output_key aponta para storage/renders/...mp4
SSE e polling                    → inalterados
GET .../renders/{job}/file       → inalterado
```

O worker continua em Python e continua sendo casca: troca um subprocesso de
ffmpeg por um subprocesso de Node. `apps/worker/video.py` muda pouco, e o
`_human_error` ganha os casos novos (Node ausente, Chromium ausente) — com o
cuidado de `conventions.md`: a mensagem diz o que fazer, e distingue dependência
faltando de problema com o arquivo.

**Por que NDJSON e não a barra de progresso do `remotion render`.** O CLI
imprime uma barra desenhada para gente ler. Um script próprio usando
`renderMedia({ onProgress })` entrega número, e o worker já sabe o que fazer com
número.

### De onde o Chromium lê o áudio e a imagem

As props carregam **URLs**, não caminhos de arquivo: as mesmas que o navegador
usa, servidas pela API (`/tracks/{id}/audio`, `/tracks/{id}/background`). O
Chromium do render busca por HTTP em `INTERNAL_API_URL`.

A alternativa seria caminho local com `staticFile()`, e ela obriga a composição
a se comportar de um jeito no preview e de outro no render — que é exatamente o
que esta spec existe para evitar. O preço é que **a API precisa estar de pé
durante o render**; na prática worker e API sobem juntos, e o erro, quando
acontecer, é claro. É troca consciente, e é o eco do §14 de `pitfalls.md`: o
Next já precisa de dois endereços para a API pelo mesmo motivo.

### Movimento reduzido

`globals.css` desliga animação sob `prefers-reduced-motion`. No render isso
achataria o vídeo inteiro. A composição **não** consulta essa preferência; quem
consulta é o editor, e só para o preview. Mais uma linha para `pitfalls.md`.

---

## 9. O player de karaokê existente

`/track/[id]/play` roda hoje o `KaraokePlayer`, com CSS próprio. Deixá-lo como
está recria a duplicação que esta spec acaba de eliminar, agora entre React e
React.

**Proposta:** a página de play passa a montar a mesma composição no
`@remotion/player`, em tela cheia, lendo o `video_project` da faixa. O que ela
tem de exclusivo — ajuste de offset pelo teclado, nudge por verso, rolagem da
letra inteira com o verso ativo centralizado (`centerOffset`) — é interface de
edição de tempo e fica **em volta** do player, não dentro da composição.

É mudança grande, e vale como fase separada (§13). Se ficar para depois, o custo
é conviver por um tempo com duas aparências de karaokê — e isso precisa ser dito
em voz alta, em vez de descoberto.

---

## 10. API

Enxuta, três rotas:

| Rota | Papel |
|---|---|
| `GET /tracks/{id}/video-project` | devolve o projeto, criando-o com os padrões se não houver |
| `PUT /tracks/{id}/video-project` | grava `settings` inteiro, validado pelo Pydantic |
| `GET /video/templates` | catálogo de templates |

`PUT` com o objeto inteiro em vez de `PATCH` por campo: o editor sempre tem o
estado completo em mãos, e gravação parcial concorrente não tem quem resolva num
app de um usuário só. A espera antes de gravar fica no cliente, como
`BackgroundPicker` já faz.

Os templates vêm da API mesmo morando em código TypeScript? Não —
`packages/composition` é importado direto pelo `apps/web`, então o catálogo
chega sem viagem de rede. A rota existe só para o backend validar um
`template_id` que já não exista mais. *(Se na implementação isso se mostrar
inútil, ela some.)*

Tudo que é novo entra em `lib/api.ts` e em `lib/types.ts`, como manda
`conventions.md`, e toda tela tem estado de carregando, vazio e erro.

---

## 11. Riscos, e o que cada um produz se der errado

| Risco | Sintoma | Contenção |
|---|---|---|
| Chromium no Docker arm64 | o build do worker quebra, ou o render trava sem mensagem | Verificar cedo, na fase 0. O `Dockerfile.worker` já é o ponto delicado do projeto (`pitfalls.md` §15). Cabe recomendar render fora do contêiner, como já se recomenda para a GPU (§16). |
| Fonte não carregada a tempo | os primeiros segundos saem em outra fonte | `delayRender` até `document.fonts.ready`, com teste que inspeciona o quadro 0. |
| Animação não determinística | o vídeo tem saltos que o preview não tem | Proibir estado entre quadros e `Math.random` na composição. Teste: a mesma entrada dá o mesmo estilo. |
| Render mais lento que o Pillow | espera maior do que a de hoje | Medir na fase 0, com faixa real, antes de escrever o resto. Se for ruim, mexer em concorrência e usar JPEG como formato intermediário. |
| Decodificar o áudio inteiro no editor | aba pesada em faixa longa | Medir. Se incomodar, reduzir a resolução da análise. |
| Preview e render divergirem mesmo assim | o defeito que esta spec promete matar | Um teste que renderiza três quadros de uma composição fixa e compara com referências versionadas. |
| Licença do Remotion | bloqueio se o projeto deixar de ser pessoal | Registrado aqui. A fronteira de `packages/composition` mantém a troca de motor possível, ainda que cara. |

E a regra que `conventions.md` já deixou escrita, que aqui vale em dobro:
**mudança visual não se verifica com `make test`.** Renderize e olhe. Dois
defeitos reais deste projeto (`pitfalls.md` §7 e §12) passaram por toda a suíte.

---

## 12. Decisões a confirmar antes do plano

1. **Migrar o player de karaokê** para a composição (§9) na mesma entrega, ou
   deixar para depois, convivendo com duas aparências?
2. **Manter `verso_lyrics.syllables` e `normalize` em Python** (§2) depois que
   perderem o único consumidor de produção, apostando no alinhamento da fase 2,
   ou removê-los junto com `packages/video`?
3. **Formato retrato (9:16)** ficou de fora por causa do recorte da aba
   Structure. É a diferença entre um vídeo para YouTube e um para celular, e
   deixá-lo de fora é decisão barata agora e cara depois. Fica fora mesmo?

---

## 13. Fases sugeridas

Esboço, não o plano — o plano vem depois, e tem que começar pela fase 0.

| # | Entrega | Por que nesta ordem |
|---|---|---|
| 0 | Prova de conceito: o Remotion grava um MP4 com a letra de uma faixa real, com tempo e tamanho medidos | É a fase que pode matar a spec. Nada mais faz sentido antes de saber quanto custa um render e se o Chromium sobe onde precisa. |
| 1 | `packages/composition` com `fill` e `breathe`, em paridade com o vídeo de hoje, renderizado pelo worker | Substituir o que existe, antes de acrescentar. |
| 2 | Tabela, API e a tela do editor com uma aba real (Background) | A casca, com uma aba que já vale sozinha. |
| 3 | Font, Structure e Style | As abas de configuração direta. |
| 4 | Motion: os nove modos e as três granularidades | A mais cara, e a que mais se beneficia de o resto já estar de pé. |
| 5 | Templates e a tela de entrada | Template é combinação do que existe; só depois que tudo existe. |
| 6 | Migrar o player de karaokê e aposentar `packages/video` | Limpeza, depois que o substituto está provado. |

---

## 14. Fora de escopo

Geração de fundo por IA; tradução (a aba "Translation" do print); formato
retrato e quadrado; layouts `Subtitles` e `Cover`; vídeo como fundo; mais de um
projeto por faixa; publicação direta em qualquer plataforma.
