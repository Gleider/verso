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

**Consequência de projeto:** o karaokê do vídeo **não** é legenda. O texto é
desenhado com Pillow em `packages/video/frames.py` e entregue ao ffmpeg como
quadros crus por um cano; o ffmpeg compõe com `overlay`.

Não troque isso por ASS/SRT sem antes verificar `ffmpeg -filters`. O caminho
atual tem uma vantagem real: o vídeo usa a mesma silabificação e as mesmas cores
do player, em vez de uma aproximação feita por outro motor.

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

**Correção:** `centerOffset` em `apps/web/lib/sync.ts`, que recebe a altura da
área visível. Há um teste fixando a regra: o resultado **não pode depender de
quantos versos a lista tem**.

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

**Correção:** `verso_video.images.prepare_background` valida **abrindo** o
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
