# Armadilhas

Tudo aqui foi descoberto quebrando de verdade. O que une estes casos é que
**nenhum deles é dedutível lendo o código** — e quase todos falham em silêncio,
ou com uma mensagem que aponta para o lugar errado.

Ordem: das que mais custam tempo para as de menor impacto.

---

## 1. `uv sync` desinstala os modelos de ML

**Sintoma:** a transcrição passa a falhar com *"O Demucs não está instalado"*,
mesmo tendo funcionado minutos antes. Nada no código mudou.

**Causa:** os extras de ML (`torch`, `demucs`, `faster-whisper`, ~2 GB) ficam
fora da instalação padrão. `uv sync` sincroniza o ambiente com exatamente o que
foi pedido — **sem `--extra ml`, ele remove esses pacotes**. Isso acontece
sempre que se mexe nas dependências do workspace.

**Correção:** `make ml`.

**Proteção existente:** `make worker` roda `make check-ml` antes de subir e
recusa iniciar sem as dependências. Um worker que sobe sem poder trabalhar é
pior que um worker que não sobe.

## 2. Worker de vida longa não enxerga pacotes instalados depois

**Sintoma:** o pacote está instalado (`python -c "import demucs"` funciona), mas
o worker insiste que não está.

**Causa:** o Python cacheia a listagem do `site-packages`. Um processo iniciado
antes da instalação continua achando que o pacote não existe.

**Correção:** `importlib.invalidate_caches()` antes de verificar — já está em
`verso_audio.separate.ensure_available` e no carregamento do transcritor. Para o
processo que **já está rodando**, só reiniciar resolve: ele carrega o código
antigo em memória.

**Ao diagnosticar:** compare a idade do worker (`ps -p <pid> -o etime=`) com o
horário da instalação. Os timestamps do Postgres são **UTC**; a hora local do
Mac não. Essa diferença já levou a conclusões erradas aqui.

## 3. O ffmpeg local é uma build mínima

**Sintoma:** `Filter not found` ou `No option name near 'subs.ass'`.

**Causa:** o ffmpeg do Homebrew nesta máquina traz apenas `libx264`. **Não tem
`libass` nem `drawtext`** — nenhum filtro de legenda ou de texto existe.

**Consequência de projeto:** o karaokê do vídeo **não** é legenda. Quem desenha
o texto é a composição Remotion de `apps/web/composition/`, num Chromium
headless; o ffmpeg só codifica o que sai dele. (Até o editor de vídeo integrado
o desenho era Pillow em `packages/video/frames.py`, com os quadros crus indo ao
ffmpeg por um cano — esse pacote não existe mais.)

Não troque isso por ASS/SRT sem antes verificar `ffmpeg -filters`. O caminho
atual tem uma vantagem maior ainda desde o editor: o vídeo não usa a mesma
silabificação e as mesmas cores do player — ele **é** o player, o mesmo
componente React desenhando os dois.

**Filtros que esta build tem** e que o efeito VHS usa: `rgbashift`, `noise`,
`geq`, `eq`, `vignette`, `zoompan`, `overlay`.

## 4. O proxy do Next derruba uploads

**Sintoma:** `500 Internal Server Error` ao enviar um arquivo grande, mas a
mesma requisição direto na API responde `202`.

**Causa:** o proxy de `rewrites` do Next quebra com corpos acima de ~8 MB.
Medido: 8 MB passa, 16 MB não.

**Correção aplicada:** não existe mais rewrite. `apps/web/lib/api.ts` aponta
direto para a API (`NEXT_PUBLIC_API_URL`, com `http://localhost:8000` como
padrão) e o CORS cobre o acesso.

**Não reintroduza o proxy.** Foi ter dois caminhos possíveis que escondeu o
problema.

## 5. Timings do Whisper vêm inflados

**Sintoma:** o destaque do karaokê arrasta sobre trechos onde ninguém está
cantando.

**Causa:** o Whisper não mede o áudio — os tempos saem dos pesos de atenção do
modelo. O defeito característico é a última palavra de um trecho absorver o
silêncio seguinte: 0,6 s de canto viram 2,5 s de destaque.

**Correção:** `normalizeWords` (`apps/web/lib/normalize.ts`) e `normalize_words`
(`verso_lyrics/normalize.py`) cortam durações implausíveis, desfazem
sobreposições e garantem ordem crescente — a busca binária do destaque depende
dessa ordem.

Silêncio real entre palavras é preservado: a correção é sobre **duração**, nunca
sobre posição.

## 6. `docker compose` não acha o `.env`

**Sintoma:** variáveis como `REDIS_HOST_PORT` são ignoradas e o compose usa
portas padrão, batendo com o que já está em uso na máquina.

**Causa:** o `.env` está na raiz, mas o arquivo compose está em `infra/` — e é
lá que o compose procura o dele.

**Correção:** o `Makefile` passa `--env-file .env` explicitamente, via a
variável `COMPOSE`. Use-a em qualquer alvo novo.

## 7. `Image.paste` com máscara apaga o que está embaixo

**Sintoma:** no vídeo, o verso vizinho aparecia cortado exatamente até onde o
preenchimento do karaokê chegava.

**Causa:** `paste` **substitui** os pixels de destino. Os pixels transparentes
da camada colada apagam o que já estava desenhado ali.

**Correção:** aplicar o recorte no canal alfa e usar `alpha_composite`. Está em
`verso_video.frames.LyricsLayer.draw`.

Este defeito passa por qualquer teste automatizado. Só apareceu porque um quadro
foi extraído e **olhado**.

## 8. Centralizar pela altura errada

**Sintoma:** a letra do player some assim que a música começa a tocar.

**Causa:** o cálculo usava a altura da **lista de versos** (milhares de pixels)
em vez da altura do **viewport**. Metade disso é um deslocamento enorme que joga
tudo para fora da tela.

**Correção:** `centerOffset`, que recebia a altura da área visível, com um teste
fixando a regra: o resultado **não pode depender de quantos versos a lista tem**.

**Estado atual:** o player virou a composição Remotion, que centraliza o verso
ativo dentro do quadro do vídeo — `apps/web/lib/sync.ts` foi apagado junto com o
player antigo. A armadilha fica registrada porque a régua continua valendo em
qualquer centralização futura: a medida de referência é sempre a **área
visível**, nunca o tamanho do conteúdo.

## 9. Adicionar valor a um enum do Postgres

**Sintoma:** a migration trava ou falha ao adicionar um valor a um tipo enum.

**Correção:** `ALTER TYPE ... ADD VALUE` precisa rodar fora da transação da
migration:

```python
with op.get_context().autocommit_block():
    op.execute("ALTER TYPE job_kind ADD VALUE IF NOT EXISTS 'render'")
```

Ver `0005_render.py`. E nas colunas, use `postgresql.ENUM(..., create_type=False)`
— senão o `CREATE TABLE` tenta criar o tipo de novo (foi o que quebrou a
`0001` na primeira tentativa).

## 10. Migration travada por conexão ociosa

**Sintoma:** `alembic upgrade head` pendura indefinidamente.

**Causa:** alguma conexão em `idle in transaction` segurando o lock da tabela.

**Diagnóstico:**

```sql
SELECT pid, state, wait_event_type, left(query, 60)
FROM pg_stat_activity WHERE datname='verso';
```

**Correção:** encerrar **apenas** as conexões nesse estado:

```sql
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE datname='verso' AND state='idle in transaction' AND pid <> pg_backend_pid();
```

Se isso virar rotina, há sessão vazando em algum lugar — investigue a origem em
vez de só matar.

## 11. Validar imagem pela extensão

**Sintoma:** foto válida recusada com *"Formato não é aceito"*.

**Causa:** nome de arquivo é palpite. Arquivos exportados por outros programas
ou baixados da web chegam sem extensão; no Mac, fotos são `.heic` por padrão.

**Correção:** `verso_core.images.prepare_background` valida **abrindo** o
arquivo com Pillow, normaliza (máx. 2560 px), respeita a orientação EXIF e
grava em formato único. O limite é 40 MB — foto de câmera passa de 10 MB com
facilidade.

## 12. Efeito visual imperceptível

**Sintoma:** "não acontece nada na imagem".

**Duas causas, ambas já corrigidas:** amplitude pequena demais (6% de zoom
diluídos em 30 s dão 0,2% por segundo — invisível), e o efeito estar dentro da
guarda que pula quadros quando o áudio não avança, o que o congelava com a
música pausada.

**Regra:** a imagem tem **relógio próprio** e se move mesmo sem áudio. Só o
pulso da batida depende da música tocando.

Há um teste garantindo que a amplitude é **grande o bastante para ser vista** —
ele existe para impedir que esse defeito volte.

---

## 13. `2>/dev/null` em Dockerfile esconde a causa

**Sintoma:** o build falha com `exit code: 1` e nenhuma explicação, ou — pior —
"passa" produzindo uma imagem incompleta.

**Causa:** o padrão `RUN comando 2>/dev/null || fallback` engole o erro do
primeiro comando. Quando ele falha, você vê só o resultado do fallback.

**Correção:** os Dockerfiles não usam mais supressão. Se um comando de build
pode falhar, deixe o erro aparecer.

## 14. O Next precisa de dois endereços para a API

**Sintoma:** dentro do Docker a biblioteca aparece vazia, sem erro visível.

**Causa:** o navegador e o servidor enxergam a API por caminhos diferentes. O
navegador usa a porta publicada no host (`localhost:8000`); os Server Components
rodam **dentro** do contêiner, onde `localhost` é o próprio contêiner web — a
API está em `http://api:8000`.

**Correção:** `apps/web/lib/server-api.ts` expõe `SERVER_API_URL`, que lê
`INTERNAL_API_URL` primeiro. Todo Server Component usa essa constante;
`lib/api.ts` (navegador) continua com `NEXT_PUBLIC_API_URL`.

Lembre-se: variáveis `NEXT_PUBLIC_` são **embutidas durante a construção** da
imagem. Trocar a porta da API exige reconstruir o web, não só reiniciar.

## 15. Uma dependência do Demucs não tem wheel para Linux arm64

**Sintoma:** ao construir a imagem do worker em Mac com Apple Silicon, o build
morre em `sphn==0.2.1` → `maturin` → `audiopus_sys`.

**Causa:** `sphn` publica wheels para macOS arm64, Linux **x86_64** e Windows —
mas não para Linux arm64. Como o contêiner é arm64, o instalador cai na
compilação a partir do código-fonte, que precisa de Rust **e** CMake **e**
libopus.

**Correção aplicada:** `infra/Dockerfile.worker` instala
`build-essential`, `pkg-config`, `cmake`, `libopus-dev` e o toolchain Rust. A
compilação leva cerca de um minuto, uma vez só.

Não troque a imagem base por uma mais enxuta sem verificar isso de novo.

**Não** resolva isso construindo para `linux/amd64`: a emulação tornaria a
transcrição inviavelmente lenta.

## 16. Contêiner no Mac não acessa a GPU

Demucs e Whisper rodam em **CPU** dentro do Docker — sem MPS. Uma faixa de
4 minutos pode passar de 10 minutos, contra poucos minutos nativo.

Não é defeito: é limitação da virtualização no macOS. Para uso real, rode o
worker fora do contêiner (`make ml && make worker`) e deixe o resto em Docker.

---

As armadilhas a partir daqui vieram do editor de vídeo integrado (Remotion) —
ver `docs/specs/2026-09-14 integrated-video-editor/`.

## 17. O pulso da batida nunca dispara no vídeo exportado

**Sintoma:** o vídeo sai sem nenhuma reação à música — a imagem respira, mas
o pulso de `lib/beat.ts` nunca aparece, mesmo em trechos com grave forte. Sem
erro nenhum: um vídeo sem pulso não parece quebrado.

**Causa:** o `AnalyserNode` do navegador entrega bytes numa escala de
**decibéis** (`255·(dB − minDecibels)/(maxDecibels − minDecibels)`); o
`visualizeAudio()` do Remotion entrega **magnitude linear** normalizada. As
constantes de `lib/beat.ts` (`MIN_ENERGY = 0.06`, `THRESHOLD = 1.35`) foram
calibradas contra a primeira escala. Na segunda, a energia média de uma
música fica na ordem de 10⁻³ — sempre abaixo do piso de silêncio.

**Correção:** `composition/audio/bandas.ts:magnitudeParaEscalaDeAnalisador`
traduz magnitude linear para a escala do `AnalyserNode` antes de alimentar
`stepBeat`. `composition/audio/envelope.ts` constrói o envelope inteiro
**sempre do quadro 0, em ordem** — `stepBeat` é uma recorrência com estado, e
o Remotion renderiza quadros fora de ordem e em paralelo.

## 18. O cache de `visualizeAudio` mistura áudios diferentes num teste

**Sintoma:** dois testes com sinais sintéticos diferentes produzem o mesmo
resultado, ou um pulso que deveria disparar fica em zero — só em teste, nunca
em produção.

**Causa:** `getMaxPossibleMagnitude` (dentro de `@remotion/media-utils`)
cacheia a amplitude máxima por `resultId`, num objeto de módulo que sobrevive
entre testes. Um `MediaUtilsAudioData` sintético reaproveitando o mesmo
`resultId` de um teste anterior herda a normalização do primeiro áudio.

**Correção:** cada fixture de teste usa um `resultId` único (um contador
incremental basta). Em produção não há risco: `getAudioData` gera um
`resultId` genuinamente único por arquivo decodificado.

## 19. CORS bloqueia o render, com mensagem de rede

**Sintoma:** o render falha com `Failed to fetch. Does the resource support
CORS?`, e o log do Chromium aponta para a origem `http://localhost:<porta
aleatória>` — uma porta que ninguém configurou.

**Causa:** `renderMedia()` serve o bundle da composição num servidor local em
**porta sorteada** a cada execução. `useAudioData` faz um `fetch()` de
verdade para essa origem; `allow_origins=["http://localhost:3000"]` (a
origem do Next) não cobre uma porta que muda a cada render.

**Correção:** `apps/api/src/verso_api/main.py` usa `allow_origin_regex`
(`http://(localhost|127\.0\.0\.1)(:\d+)?`), não uma lista fixa. **Não** use
`chromiumOptions: {disableWebSecurity: true}` como atalho — mascara um erro
de configuração real.

## 20. `bundle({outDir})` apaga o próprio diretório de saída

**Sintoma:** o cache do bundle (uma impressão digital que evita reconstruir a
cada render) desaparece sempre, como se nunca tivesse sido escrito.

**Causa:** `bundle()` limpa `outDir` antes de escrever — qualquer arquivo de
controle salvo **dentro** dele some junto.

**Correção:** `apps/web/renderer/render.mjs` grava a impressão digital em
`<bundleDir>.sha256`, **irmã** do diretório do bundle, nunca filha dele.

## 21. `apps/web/node_modules` sobrescreve o que o Docker acabou de instalar

**Sintoma:** o worker builda sem erro, mas o primeiro render falha com
`Cannot find module '@remotion/compositor-linux-x64-gnu'` — um binário que
"deveria" estar ali.

**Causa:** `@remotion/renderer` tem um binário **por plataforma** em
`optionalDependencies`. O Dockerfile roda `npm ci` (que instala o binário Linux
correto) e, depois, copia `apps/web` do contexto — sem um `.dockerignore`
excluindo `apps/web/node_modules`, essa cópia **sobrescreve** o que acabou de
ser instalado com o `node_modules` local de quem fez o build (macOS ou
Windows), que tem o binário errado.

**Correção:** `.dockerignore`, na raiz do repositório, exclui
`apps/web/node_modules` e `apps/web/.next`. Vale para os três Dockerfiles
(`context: ..` em `infra/docker-compose.yml`).

**O worker ganhou uma defesa a mais:** ele passou a copiar só
`composition/`, `lib/`, `public/` e `renderer/` do contexto, e recebe o
`node_modules` do próprio estágio de construção (`COPY --from=construcao`), que
nunca vem da máquina de quem builda. A armadilha continua valendo de cheio para
`Dockerfile.web`, que ainda copia `apps/web` inteiro.

## 22. `<Composition>`/`<Player>` inferem `Props` como `Record<string, unknown>`

**Sintoma:** `tsc` acusa que `KaraokeProps` não tem os campos esperados,
mesmo com o componente e as `defaultProps` corretamente tipados.

**Causa:** sem um `schema` (zod), o TypeScript não consegue inferir o
parâmetro `Props` de `<Composition<Schema, Props>>` através do tipo
condicional `CalculateMetadataFunction<InferProps<Schema, Props>>` — é uma
posição não-inferível para o compilador, e ele cai no tipo da restrição
(`Record<string, unknown>`).

**Correção:** dois ajustes, os dois em `composition/Root.tsx`:
`<Composition<AnyZodObject, KaraokeProps>>` com o par de tipos explícito, **e**
`KaraokeProps`/`VideoSettings` declarados com `type`, não `interface` — uma
interface nomeada não satisfaz `Record<string, unknown>` no ponto de
instanciação explícita; só um alias de objeto literal satisfaz. É a única
exceção à convenção de usar `interface` em props de componente
(`conventions.md`), e vale só para tipos que cruzam essa fronteira do
Remotion.

## 23. Rebuild do contêiner não é opcional depois de editar código

**Sintoma:** uma correção no código (CORS, um schema novo, uma tela inteira
nova) parece não ter efeito nenhum — o comportamento antigo continua, sem
erro. Os contêineres sobem, respondem, e mesmo assim nada mudou.

**Causa:** `apps/api`, `apps/worker` **e `apps/web`** rodam em Docker a partir
de uma imagem **construída** — `docker compose up` sem `--build` sobe o
container de novo, mas com o código de quando a imagem foi construída, não o
do arquivo que acabou de ser salvo. Isso vale para o Next.js tanto quanto
para o Python: já aconteceu de `api` e `worker` serem reconstruídos várias
vezes numa sessão de trabalho e `web` ser esquecido, deixando a interface
inteira do editor de vídeo invisível — o site parecia idêntico a antes, sem
nenhum sinal de erro, porque tecnicamente **estava** rodando um site correto,
só que o antigo.

**Correção:** depois de mudar `packages/core`, `apps/api`, `apps/worker` **ou
qualquer coisa em `apps/web`**, reconstrua especificamente o(s) serviço(s)
tocado(s):

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d --build <serviço>
```

Ao terminar uma mudança que toca vários serviços, é mais seguro reconstruir
todos (`up -d --build`, sem nomear serviço) do que confiar na memória de quais
foram tocados. Rodar nativo (`make api`, `make worker`, `make web`) não tem
esse problema — é uma razão a mais para preferir isso em desenvolvimento ativo.

## 24. O standalone do Next não leva `public/` junto

**Sintoma:** no Docker, **nenhuma** fonte da composição funciona. O seletor de
família parece morto: as oito opções produzem o mesmo texto, porque as oito
caem no fallback do sistema. Nativo (`make web`) está tudo certo.

**Causa:** `output: "standalone"` monta `.next/standalone` com o servidor e as
dependências, mas **não copia `public/`** — a documentação do Next diz que
copiar é responsabilidade de quem escreve o Dockerfile. Os `.woff2` dão 404,
`loadFont()` falha em silêncio e o Chromium desenha com a fonte genérica.

**Correção:** `infra/Dockerfile.web` tem
`COPY --from=builder /app/public ./public`. Vale para qualquer coisa servida de
`public/`, não só fonte.

## 25. Fonte variável declarada com um peso só trava a instância

**Sintoma:** o controle de peso não faz nada. O arquivo é variável, o eixo
existe, e mesmo assim 300 e 800 saem idênticos.

**Causa:** `loadFont({weight: "400"})` descreve um `FontFace` de peso **fixo**.
O Chromium instancia o eixo nesse valor e ignora o `font-weight` do CSS.

**Correção:** declarar o intervalo — `weight: "200 800"` — para as famílias
variáveis, e o peso real para as estáticas. `composition/fonts.ts` guarda
`pesoMin`/`pesoMax` por família e `pesoSuportado()` limita o valor salvo ao
eixo que a família tem; o painel desabilita o controle quando os dois são
iguais, em vez de deixar um deslizador que não muda nada.

## 26. `inline-block` descarta o espaço do fim de dentro dele

**Sintoma:** com um modo de movimento que transforma cada segmento (o
`bubbling`), as palavras do verso saem coladas: `ocachorroatravessou`. Com os
outros modos, o mesmo verso sai certo.

**Causa:** os segmentos carregam o espaço entre palavras no próprio texto
(`versos.ts` anexa um espaço ao fim de cada palavra que não é a última). Um
`<span>` só vira `inline-block` quando o modo tem `transform`, e um
`inline-block` **colapsa o espaço final de dentro dele** — o espaço existe no
DOM e não ocupa largura nenhuma.

**Correção:** `whiteSpace: "pre-wrap"` no span, em `layers/Verso.tsx`.
`pre-wrap`, não `pre`: preserva o espaço **e** mantém o ponto de quebra de
linha, que `pre` mataria.

Este defeito passa por qualquer teste: as funções puras devolvem o texto
certo. Só apareceu quando um quadro foi extraído e **olhado** — é o terceiro
caso deste arquivo com essa mesma moral (§7 e §12 são os outros).

---

As três próximas vieram de trocar as texturas de CSS para shaders GLSL
(`@remotion/effects`).

## 27. O render precisa de `swangle`, e `angle` engana quem tem GPU

**Sintoma:** o render morre com
`Failed to acquire WebGL2 context for canvas effect` — **só dentro do
contêiner**. Na máquina de desenvolvimento, o mesmo código renderiza os
efeitos perfeitamente.

**Causa:** os efeitos de `@remotion/effects` são shaders GLSL e exigem um
contexto WebGL2, que o Chromium headless não cria por padrão. Até aí, a
correção óbvia é `chromiumOptions: {gl: "angle"}` — e ela **funciona no
Windows com GPU**, porque lá o ANGLE encosta no D3D11. O contêiner do worker
não tem GPU nenhuma, e o ANGLE não tem em que se apoiar.

**Correção:** `gl: "swangle"` (SwiftShader + ANGLE, rasterização por
**software**) é o padrão em `apps/web/renderer/render.mjs`. É o mesmo backend
que o Remotion usa por padrão no Lambda, pelo mesmo motivo. `VERSO_RENDER_GL=angle`
troca para o caminho por hardware em quem tem GPU e quer velocidade.

**A armadilha dentro da armadilha:** `angle` passa em desenvolvimento e falha
em produção. Todo ajuste na camada de shaders precisa de um render **dentro do
contêiner** antes de ser dado como pronto — o teste local não cobre isto.

O Chromium ainda avisa que "automatic fallback to software WebGL has been
deprecated". É aviso, não erro: o render completa. A opção
`--enable-unsafe-swiftshader` que ele sugere não é exposta pelo
`chromiumOptions` do Remotion.

## 28. O custo do efeito é por PASSE, e é linear

**Sintoma:** o preview do editor, que corria solto, cai para 5–10 fps. O vídeo
exportado sai certo; o render nem parece tão mais lento. Só a edição fica
intragável.

**Causa medida.** Não é orquestração — essa foi a primeira hipótese, e ela
estava **errada**. Montar canvas custa praticamente zero. O que custa é cada
passe: `@remotion/effects` dava um canvas POR EFEITO, em ping-pong, e cada
passe fazia `texImage2D` do canvas anterior (cópia de 2 MP) mais um
`drawImage` final para o canvas 2D de saída.

Medido em 90 quadros, `concurrency: 1`, `gl: angle`, mínimo de 3 execuções,
descontado o piso do arnês:

| passes | por quadro | por passe |
|---|---|---|
| 0 (sem canvas) | 0 ms | — |
| 1 | 7,0 ms | 7,0 |
| 3 | 18,8 ms | 6,3 |
| 4 | 29,9 ms | 7,5 |
| 7 | 57,6 ms | 8,2 |

E no preview de verdade (navegador, contando quadros pintados): 60 fps até 1
passe, 56,8 com 3, **34,8 com 4** e **30,8 com 7**.

**Correção, em duas frentes:**

1. *Só vira shader o que precisa **amostrar** os pixels vizinhos.* Cor, grão,
   vinheta e poeira não amostram — são `filter` e camada de CSS, compostos
   pela GPU do navegador sem custo por quadro. Daí as duas famílias de
   `TextureId` e o `precisaDeGl()` de `layers/Fundo.tsx`.
2. *Um passe só.* `composition/gl/` monta **um** fragment shader com fundo e
   efeito no mesmo `main()`, num contexto próprio, desenhado síncrono. Um
   efeito multi-amostra (cromático, borrão radial, retícula) chama a função
   do fundo de novo em vez de precisar do resultado numa textura intermediária.

**Ao medir:** o arnês de render tem piso alto (~9 s em 90 quadros, de captura
e x264) e variância grande — a mesma configuração deu de 12,0 a 14,4 s entre
execuções. Meça o **mínimo de três execuções**, sempre contra o piso, e
lembre que o render **não é proxy do preview**: para o preview, conte quadros
pintados por `requestAnimationFrame` num navegador de verdade.

## 29. O hash de ruído dos exemplos quebra em ANGLE

**Sintoma:** um fundo procedural que deveria ser nuvem macia sai com
**retângulos de borda dura** espalhados pelo quadro. Some e volta conforme o
tempo. Parece compressão de vídeo — e não é: reproduz igual em `crf 8` com
preset `medium`.

**Causa:** `fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453)`, o hash de
todo exemplo de shader na internet, depende de precisão que o `highp` de
ANGLE não garante. Quando o seno satura, células inteiras do ruído colapsam
no mesmo valor e viram bloco.

**Correção:** hash de aritmética pura, sem transcendental, em
`composition/gl/glsl/comum.ts`. Custa o mesmo e não colapsa.

**Como diagnosticar de novo:** renderize o mesmo quadro com `crf 8` e preset
`medium`. Se o bloco continuar, é shader; se sumir, era x264 no gradiente liso.

## 30. PowerShell 5.1 corrompe os arquivos deste repositório

**Sintoma:** um `.ps1` que parece correto falha com
*"A cadeia de caracteres não tem o terminador"* numa linha que não tem aspas
nenhuma. Ou: um `.ts` editado por `Get-Content`/`Set-Content` fica cheio de
`cÃ³digo` e `â€"`.

**Causa:** duas, e as duas por causa do português. O PowerShell 5.1 lê arquivo
UTF-8 **sem BOM** como ANSI (CP1252): o travessão `—` (`E2 80 94`) vira
`â€”`, e o `0x94` do meio é a **aspa curva de fechamento**, que o parser do
PowerShell aceita como delimitador de string. Daí o erro aparecer longe da
causa. Pelo mesmo caminho, ler um `.ts` e regravá-lo produz dupla codificação.

**Correção:** arquivos `.ps1` deste repositório são gravados em **UTF-8 com
BOM**. E para editar código, use as ferramentas de edição do agente, nunca
`Get-Content | Set-Content` — só o `-Encoding utf8` não salva, porque o
estrago acontece na *leitura*.

## 31. Crase dentro do GLSL termina o template literal

**Sintoma:** o bundle do render falha com um erro de *TypeScript* num arquivo
de shader — `Expected ";" but found "length"` — apontando para dentro de um
comentário GLSL, onde não há código nenhum.

**Causa:** o GLSL deste projeto mora em template literal
(``export const PARTICULAS = /* glsl */ ` ... ` ``). Uma crase escrita **dentro**
desse texto fecha a string ali, e o resto do shader vira código TypeScript
inválido. O hábito de marcar identificador com crase em comentário — que é a
convenção de comentário do resto do repositório — é justamente o que faz isso.

Já aconteceu três vezes, sempre com um nome técnico entre crases num
comentário do shader (`object-fit: cover`, `floor(ms/...)`, `length`).

**Correção:** em comentário dentro de GLSL, escreva o identificador **sem
crase**. Para conferir um arquivo de shader:

```bash
node -e "const s=require('fs').readFileSync('gl/glsl/particulas.ts','utf8');
const c=s.slice(s.indexOf('export const'));
process.exit((c.match(/\`/g)||[]).length===2?0:1)"
```

**A lição maior:** `npx tsc --noEmit` pega isto em segundos. Renderizar para
descobrir erro de sintaxe é gastar minutos por um retorno que o compilador dá
de graça — rode o tsc **antes** do arnês de render, sempre.

## 32. `render.mjs` reporta erro no stdout, e o MP4 velho completa a ilusão

**Sintoma:** um lote de renders de conferência "passa", os PNGs saem, você
olha os quadros e conclui coisas sobre o shader. Só que o shader nem compilou.

**Causa:** duas somadas. `render.mjs` emite **NDJSON no stdout**, inclusive o
`{"tipo":"erro"}` — é o contrato com o worker Python (o stderr fica para
diagnóstico do Chromium). Um arnês que procura falha no stderr não vê nada.
E, como o job grava sempre no mesmo caminho, o **MP4 da execução anterior**
continua ali: o `ffmpeg` extrai um quadro dele sem reclamar, e o quadro
antigo passa por novo.

**Correção:** no arnês, apagar a saída antes (`rm -f`), checar
`grep -q '"tipo":"erro"'` no stdout **e** exigir que o arquivo exista e não
esteja vazio. Está em `scripts/fumaca-render.sh`, que roda dentro do contêiner:

```bash
docker compose -f infra/docker-compose.yml --env-file .env \
  run --rm --no-deps -T --entrypoint sh worker -s <track-id> --gl \
  < scripts/fumaca-render.sh
```

**Use `--gl`.** Sem ele o job sai com os padrões do `VideoSettings` — fundo em
cor sólida e textura `none` —, e aí `precisaDeGl()` é **falso**: nenhum canvas
é montado e o render não prova nada sobre a camada de shader, que é a única
parte que o §27 diz não dar para testar fora do contêiner. Um render verde no
modo simples é fácil de confundir com "o shader está bem".

**Ao conferir quadro:** extraia num instante com movimento e com letra na
tela (`-ss 4.0`), nunca no quadro 0 — em t=0 o pulso é zero, os efeitos
animados estão no repouso e ainda não há verso ativo. Um quadro 0 faz
qualquer efeito temporal parecer morto.

## 33. Ramo de settings pela metade vira NaN, e NaN não desenha nada

**Sintoma:** uma camada some do vídeo **só num ambiente** — no contêiner, ou
com um job montado à mão — enquanto local, com as mesmas settings "iguais",
ela aparece. Exit 0, nenhum erro, nenhum aviso. Parece problema de `swangle`
(§27) e não é.

**Causa:** um ramo de `VideoSettings` chegou **incompleto**. Em
`{...s.particulas, tipo: "neve"}` sobre um JSON antigo que não tinha o ramo,
sobram campos `undefined`; `0.2 + undefined * 1.8` é **NaN**, o uniforme vai
NaN para o shader, e toda comparação com NaN é falsa — o campo inteiro deixa
de ser desenhado. A camada de DOM morre do mesmo jeito: uma largura NaN dá
uma caixa de tamanho nenhum.

**Correção:** todo job montado à mão parte de um `VideoSettings` **completo**
(no caminho real quem garante isso é o Pydantic do worker e o
`normalizarSettings()` do TypeScript — nenhum dos dois roda quando se escreve
o JSON na unha). Ao suspeitar disto, compare o **tamanho do MP4**: dois
renders de configurações diferentes com byte count idêntico querem dizer que
a diferença não chegou.

## 34. O cache do bundle não via `apps/web/lib`, e o conserto não ia no MP4

**Sintoma:** você corrige a silabificação ou o saneamento de timings, renderiza
de novo e o vídeo sai **idêntico**. Exit 0, NDJSON de sucesso, MP4 com data
nova. Nada no sintoma aponta para cache — a suspeita vai para a correção
("será que não peguei o caso?"), não para o empacotador.

**Causa:** `render.mjs` decide se reaproveita o bundle comparando um SHA-256 do
que entra nele, e a impressão digital visitava só `composition/` e `public/`.
Mas a composição **importa de `lib/`**: `versos.ts` chama `timeSyllables` e
`normalizeWords`, `audio/bandas.ts` e `audio/envelope.ts` chamam `stepBeat`.
Esses arquivos estavam no bundle e fora do hash.

**Correção:** a impressão digital visita `lib/` também (`__tests__` de fora, que
não entra no bundle). Ao mexer no que a composição consome, confira que o
arquivo está dentro de `impressaoDoBundle()`; do contrário o `storage/remotion-bundle`
serve um bundle velho por tempo indeterminado.

**A regra mais larga:** cache com chave incompleta não falha, **mente**. Se
algum dia o sintoma for "minha mudança não teve efeito nenhum", apagar
`storage/remotion-bundle*` é o teste de uma linha que separa as duas hipóteses.
