# Infraestrutura em Google Cloud

**Data:** 2026-09-15 · **Estado:** proposta · **Entrada:** `spec.md`

O desenho de menor custo que ainda aguenta usuários simultâneos. A regra que
orienta tudo aqui é uma só: **o que não está sendo usado não deve custar**.

---

## 1. O desenho

```
                    navegador
                        │
           ┌────────────┴────────────┐
           │                         │
      Cloud Run: web            Cloud Run: api
      (Next.js)                 (FastAPI)
      min 0                     min 1
           │                         │
           │              ┌──────────┼──────────────┐
           │              │          │              │
           │        Cloud SQL       GCS        Cloud Tasks
           │        (Postgres)   (arquivos)   ┌──┴──┐
           │                         ▲        │     │
           │                         │    fila ASR  fila render
           │                         │        │     │
           │                         │        ▼     ▼
           │                         │   ┌─────────────────┐
           └─────────────────────────┴───┤ Cloud Run: asr  │ GPU L4, conc. 1
              URL assinada               │ Cloud Run: rndr │ CPU,    conc. 1
                                         └─────────────────┘
                                              min 0 · escala a zero
```

Quatro serviços do Cloud Run, um banco, um bucket, duas filas. Sem Redis, sem
Load Balancer, sem Kubernetes.

---

## 2. Dimensionamento

| Serviço | Recursos | Escala | Por quê |
|---|---|---|---|
| `web` (Next) | 512 MB · 1 vCPU · conc. 80 | min 0 · max 4 | Server Components só repassam fetch |
| `api` (FastAPI) | 512 MB · 1 vCPU · conc. 80 | **min 1** · max 10 | min 1 evita cold start no login, que é a primeira impressão do produto |
| `worker-asr` | **GPU L4** · 16 GB · conc. **1** | min 0 · max 2–3 | O `max` é o teto de custo, e é a alavanca principal |
| `worker-render` | 4 vCPU · 4 GB · conc. **1** | min 0 · max 5 | `swangle` é rasterização por **software**: quer vCPU, não GPU |
| Postgres | Cloud SQL, núcleo compartilhado, IP privado | vertical | **Não escala a zero** — é o piso de custo |
| Filas | Cloud Tasks | — | Sem custo fixo |
| Arquivos | GCS Standard, uma região | — | Lifecycle apaga o que é reconstruível |
| Segredos | Secret Manager | — | Stripe, Postgres, Firebase |
| Imagens | Artifact Registry | — | A do ASR é grande; limpar tags antigas |

`concurrency = 1` nos dois workers reproduz exatamente o `max_jobs = 1` de hoje
(`apps/worker/src/verso_worker/main.py`), pelo mesmo motivo do comentário que está
lá: *"Demucs e Whisper já ocupam a máquina inteira."*

---

## 3. A fila: Cloud Tasks no lugar de ARQ + Redis

### Por que trocar

Memorystore **não escala a zero** e o menor nível é o maior item fixo evitável do
piso. Manter Redis no ar 24 h por dia para uma fila que fica vazia a maior parte
do tempo é pagar pelo que não se usa — exatamente o que este documento tenta não
fazer.

E o Cloud Tasks entrega de graça quatro coisas que hoje faltam:

1. **Filas separadas.** Hoje há uma só, e um render espera atrás de uma
   transcrição de 20 minutos.
2. **Teto de concorrência por fila** (`max_concurrent_dispatches`) — é o que faz o
   excesso virar **espera** em vez de erro, e é o teto de gasto com GPU.
3. **Retry com backoff**, sem código nosso.
4. **Autenticação OIDC entre serviços**, sem segredo compartilhado.

### Como fica

Cada task é um `POST` assinado com OIDC para o worker correspondente; o Cloud Run
valida o token do service account e recusa qualquer outra origem.

```
api  ──enqueue──>  fila "transcricao"  ──POST /internal/transcribe──>  worker-asr
api  ──enqueue──>  fila "render"       ──POST /internal/render────────>  worker-render
```

O worker deixa de ser `arq verso_worker.main.WorkerSettings` e vira um **FastAPI
mínimo com duas rotas**. As funções de job — `transcribe_track` em `pipeline.py` e
`render_track_video` em `video.py` — **não mudam**: só muda quem as chama. O `ctx`
do ARQ não carrega nada que elas usem de fato.

Timeout: o Cloud Run aceita requisição de até 60 minutos, o que cobre o
`job_timeout = 3600` de hoje. Mas é teto duro, e um render longo em `swangle` pode
encostar nele — daí `worker-render` ter vCPU generoso, e daí o recorte de rede
social (que já existe em `output.recorte`) ser um aliado natural.

> **Plano B**, se a troca de fila for cara demais para a fase 4: manter ARQ com
> Redis local numa VM `e2-small`, junto com o worker. Perde escala a zero e ganha
> tempo. O gatilho para sair do plano B é o primeiro mês em que a fila encher.

---

## 4. Dois workers, não um

Hoje os dois trabalhos moram no mesmo contêiner, dimensionado para o pior dos
dois. Eles não se parecem em nada:

| | `worker-asr` | `worker-render` |
|---|---|---|
| Gargalo | GPU e memória | vCPU |
| O que carrega | Demucs + faster-whisper (~3 GB de modelo) | Chromium + Remotion |
| Imagem | grande (Torch, CUDA) | ~200 MB de Node (já separada hoje) |
| Cold start | pesado | leve |
| Quantas vezes por faixa | **uma** | muitas |

A última linha é a que decide: o usuário transcreve uma vez e exporta várias. São
curvas de escala diferentes, e juntá-las obriga a pagar GPU para desenhar texto.

**O repositório já está quase lá.** `infra/Dockerfile.worker` é de dois estágios e
já instala o Node do render a partir de um manifesto separado
(`apps/web/renderer/package.json`, 194 MB contra 1,1 GB do manifesto do app),
justamente porque *"o worker não leva o app do Next junto"*. Dividir em duas
imagens é continuar essa linha, não inverter uma decisão.

### O bundle do Remotion vai para dentro da imagem

Hoje `render.mjs` faz `bundle()` no primeiro job e cacheia em
`storage/remotion-bundle`, com impressão digital SHA-256 num arquivo irmão
(`pitfalls.md` §20). Num contêiner efêmero que morre depois do job, isso vira
**bundle a cada cold start**.

Correção: rodar o `bundle()` no `Dockerfile` do `worker-render`, em tempo de
construção. O bundle passa a ser parte imutável da imagem, o cache some junto com
o problema, e o cold start fica só o de subir o Chromium.

Efeito colateral bom: some também a classe de defeito do `pitfalls.md` §34 —
cache com chave incompleta servindo bundle velho — porque não há mais cache.

---

## 5. O ML, e as três formas de pagar por ele

`packages/asr` expõe `Transcriber` como `Protocol`, e `architecture.md` já dizia
o porquê: *"trocar faster-whisper por uma API paga não deve tocar em nenhum caso
de uso"*. A arquitetura previu esta página.

### v1 — Cloud Run com GPU L4, escala a zero

Paga por segundo de job, zero parado. O código roda praticamente sem mudança.

Dois cuidados que decidem se funciona:

- **Os modelos vão assados na imagem.** `infra/models/` já guarda
  `faster-distil-whisper-large-v3` e o HTDemucs, hoje montados como volume. Se a
  imagem não os trouxer, **cada cold start baixa ~3 GB** e o custo do primeiro job
  come a economia inteira.
- **Cold start de 1 a 3 minutos** (imagem grande, modelo a carregar). Aceitável
  porque o job já é assíncrono e a interface mostra "na fila" — mas só porque é
  assíncrono. Se algum dia houver caminho síncrono, esta escolha muda.

Conferir disponibilidade de L4 na região antes de fixar. Se `southamerica-east1`
não tiver, o ASR fica em `us-central1`: o áudio atravessa **uma vez por faixa**
(não por request), e como ele já está no GCS isso é uma transferência, não um
problema de arquitetura.

### Alternativa — API de inferência

Groq (`whisper-large-v3-turbo`), Deepgram, ou Replicate para o Demucs. Zero GPU
nossa, zero cold start, zero imagem de 8 GB, e o custo por faixa cai para centavos.

Dois preços reais, e nenhum é dinheiro:

- **O áudio do usuário sai da nossa nuvem.** Vira subprocessador, tem que estar na
  política de privacidade (LGPD), e muda o que os Termos podem prometer.
- **A qualidade do timestamp por palavra precisa ser conferida** contra o
  `faster-whisper` atual. `domain.md` é explícito: `word_timestamps=True` é
  obrigatório, *"sem isso não há karaokê"*. E o `normalizeWords` existe porque os
  timings do Whisper já vêm inflados (`pitfalls.md` §5) — um modelo diferente erra
  diferente, e o saneamento foi calibrado para o erro deste.

A troca em si é barata: uma classe nova implementando o Protocol.

### O caminho mais barato de todos — Musixmatch primeiro

Quando a música já tem letra sincronizada, **não roda ML nenhum**. O cliente já
existe (`packages/lyrics/src/verso_lyrics/musixmatch.py`) e o fluxo já está no
produto.

Vale virar regra: tentar Musixmatch, cair para ASR só quando não achar. Muda o
custo unitário médio mais do que qualquer otimização de infra deste documento.

**Mas está bloqueado.** O cliente usa a API **não oficial**, com `usertoken` e um
segredo de app embutido — inclusive como default em `config.py:40`. Num produto
pago isso é risco contratual e operacional: o token pode ser revogado sem aviso, e
aí o caminho mais barato do produto para de funcionar de repente. Decidir antes da
fase 3 (`spec.md` §5).

### Quando sair do serverless

Quando a GPU passar de **40–50% de ocupação no mês**, uma VM dedicada fica mais
barata que o por-segundo. É uma conta de padaria, e é o gatilho para refazê-la com
números reais.

---

## 6. Banco

Cloud SQL Postgres, núcleo compartilhado, IP privado, backup automático. **É o
único item que não escala a zero**, e portanto é o piso de custo do produto
parado.

Alternativa que vale registrar: Postgres serverless de terceiro que escala a zero
(Neon e similares, que rodam em regiões do próprio GCP). Mantém o protocolo, então
**não muda uma linha de código** — só a `DATABASE_URL`. O que se ganha é o piso; o
que se perde é ter o banco na mesma VPC e no mesmo contrato.

### Três coisas do código atual que a escala quebra

**1. As migrations rodam no `CMD` da API.** `infra/Dockerfile.api` faz
`alembic upgrade head` antes do `uvicorn`. Com uma instância isso é elegante; com
duas subindo juntas, são dois `alembic` concorrentes no mesmo banco. Mover para um
**Cloud Run Job** disparado pelo Cloud Build no deploy, e tirar do `CMD`.

**2. O pool do SQLAlchemy não tem tamanho explícito.**
`packages/core/src/verso_core/db.py` cria o engine sem `pool_size`/`max_overflow`,
o que dá os defaults (5 + 10) **por instância**. Dez instâncias de API são ~150
conexões, muito acima do que um Cloud SQL pequeno aceita — e o sintoma é erro de
conexão sob carga, não lentidão. Fixar `pool_size=2, max_overflow=3` e usar o
Cloud SQL Connector.

**3. O SSE consulta o banco uma vez por segundo, por cliente.** Detalhado em
`contas-e-auth.md` §4. Num Cloud SQL de núcleo compartilhado, algumas dezenas de
espectadores simultâneos são carga de verdade — e desnecessária.

---

## 7. Arquivos

Bucket único, GCS Standard, mesma região do resto. Prefixo por conta
(`contas-e-auth.md` §5), acesso por **URL assinada V4**, nunca pública.

### Lifecycle é controle de custo, não arrumação

| Prefixo | Política | Por quê |
|---|---|---|
| `**/work/` | apagar em 1 dia | Temporário do pipeline; `pipeline.py` já limpa no `finally`, isto é a rede de segurança |
| `**/vocals/` | apagar em N dias | **Reconstruível** a partir do original, e é o segundo maior arquivo por faixa |
| `**/renders/` (free) | apagar em 90 dias | Limita o custo de quem não paga |
| `**/originals/` | manter | É o que o usuário subiu; apagar destrói o trabalho dele |

O stem vocal é o ponto mais interessante: hoje `verso_keep_vocal_stem = True`
mantém ele para sempre, o que faz todo sentido num disco local. Num bucket pago,
guardar indefinidamente algo que se refaz rodando o Demucs de novo é pagar
armazenamento para não pagar CPU — e a conta inverte quando a faixa nunca mais é
tocada.

### O upload precisa deixar de passar pela API

Hoje `routers/tracks.py` grava o arquivo inteiro e **só então** confere o tamanho
contra `max_upload_bytes`. No Cloud Run, o disco é RAM: um arquivo grande derruba
a instância antes de a validação rodar.

Correção: **upload direto ao GCS por URL assinada resumable**. O navegador manda
para o bucket, a API recebe só o nome do objeto e dispara o `ffprobe`. Some a
banda de entrada do Cloud Run, some o risco de memória, e o `pitfalls.md` §4
(*"o proxy do Next derruba uploads"*) deixa de ter como voltar — a API não recebe
mais corpo grande de jeito nenhum.

Ponta solta a resolver na implementação: o `sha256` de dedup hoje é calculado no
servidor, lendo o stream (`storage.sha256_of`). Com upload direto, passa a ser
calculado no navegador (`SubtleCrypto`) antes de enviar. Como a dedup agora é por
conta e é conveniência — não controle de acesso —, confiar no valor do cliente é
aceitável; o que **não** é aceitável é usar esse hash para decidir se alguém pode
ver algo.

---

## 8. Deploy

Cloud Build disparado por push, um `cloudbuild.yaml`:

```
1. build das 4 imagens (cache por camada no Artifact Registry)
2. Cloud Run Job: alembic upgrade head        ← e só ele roda migration
3. deploy dos 4 serviços
4. smoke: GET /health, e um render de 7 s contra uma faixa de teste
```

O passo 4 não é zelo excessivo. `pitfalls.md` §27 é explícito: a camada de shader
**passa na máquina com GPU e falha no contêiner**, e `gl: "swangle"` é a diferença.
O arnês já existe (`scripts/fumaca-render.sh`) e já sabe checar o que importa —
que o stdout não traz `{"tipo":"erro"}` e que o arquivo saiu não-vazio
(`pitfalls.md` §32).

Um deploy que sobe verde e só quebra no primeiro render de usuário é o modo de
falha que este projeto já conhece.

### Domínio

**Domain mapping do Cloud Run, não Load Balancer global.** O LB tem custo fixo
mensal relevante e não entrega nada de que a v1 precise. Cloudflare na frente se
quiser cache e WAF sem pagar por eles.

E uma correção obrigatória junto: o CORS de `apps/api/src/verso_api/main.py` é
`allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?"`. **Qualquer deploy
com domínio real quebra o frontend.** O regex existe por um motivo bom — o
Chromium do render serve o bundle numa porta sorteada (`pitfalls.md` §19) — mas
essa necessidade desaparece quando o render passa a buscar de URL assinada do GCS
em vez da nossa API. Então o regex vira a lista do domínio de produção, e fica
mais seguro do que é hoje.

---

## 9. Custo

> **Nenhum número de dinheiro aparece aqui.** Preço de nuvem muda e este documento
> não tem como envelhecer bem carregando tabela de preço. O que segue é a
> **estrutura** do custo; os valores vão para a calculadora do GCP na hora de
> decidir, com a data da consulta anotada.

### O piso (produto parado, ninguém usando)

| Item | Escala a zero? |
|---|---|
| **Cloud SQL** | **não** — é o item dominante do piso |
| Cloud Run `api` com `min 1` | não (por escolha; `min 0` derruba o piso ao custo de cold start no login) |
| Cloud Run `web`, `asr`, `render` | **sim** |
| GCS, Cloud Tasks, Secret Manager, Artifact Registry | custo de armazenamento apenas |
| Firebase Auth | grátis na faixa |
| Domain mapping | sem custo fixo (o LB global teria) |

Ou seja: **o piso é o banco, mais a escolha de manter uma instância de API
quente.** Tudo o mais é variável.

### O variável (por faixa e por render)

```
custo de uma faixa  =  GPU-segundo do Demucs + Whisper      (uma vez)
                     + armazenamento do original e do stem  (mensal)

custo de um render  =  vCPU-segundo do Chromium + ffmpeg
                     + egress do MP4 baixado
```

### Alavancas, em ordem de retorno

1. **Musixmatch antes do ASR** — elimina a GPU do caso comum. Nenhuma outra chega
   perto.
2. **`distil-large-v3` no lugar do `large-v3`** — cerca de 4× mais rápido, e o
   próprio código já anota isso (`faster_whisper_transcriber.py:22`). É trocar uma
   constante.
3. **Bundle assado na imagem** — elimina o bundle por cold start (§4).
4. **SSE → polling** — elimina vCPU-minuto por espectador (`contas-e-auth.md` §4).
5. **Lifecycle apagando `vocals/` e `work/`** (§7).
6. **Free com marca d'água, 720p e 60 s** — limita estruturalmente o custo de quem
   não paga.

### A conta que precisa ser medida antes de precificar

O preço do crédito depende de GPU-segundo + vCPU-segundo + egress por render. O
arnês para medir já existe — `scripts/fumaca-render.sh`, dentro do contêiner — e
falta rodá-lo contra o dimensionamento real.

E há um aviso registrado sobre como medir: `pitfalls.md` §28 mostra que o arnês
de render tem **piso alto e variância grande** (a mesma configuração deu de 12,0 a
14,4 s entre execuções). Medir o **mínimo de três execuções**, sempre contra o
piso. Precificar em cima de uma execução só é o mesmo erro, com dinheiro.

---

## 10. Resumo do que muda no código

Para a fase 4 (`spec.md` §4) não descobrir nada tarde:

| Arquivo | Mudança |
|---|---|
| `packages/core/.../storage.py` | `GcsStorage`; `signed_url`, `open`, `delete_prefix`; `path_for` sai do Protocol |
| `packages/core/.../db.py` | `pool_size` e `max_overflow` explícitos; Cloud SQL Connector |
| `packages/core/.../config.py` | Bucket, fila, projeto, região; `verso_storage_dir` vira só o caminho de desenvolvimento |
| `apps/api/.../routers/jobs.py` | SSE sai, polling entra |
| `apps/api/.../routers/tracks.py` | Upload direto ao GCS; endpoints de arquivo viram 302 para URL assinada; commit antes de enfileirar |
| `apps/api/.../main.py` | CORS com o domínio de produção |
| `apps/api/.../queue.py` | ARQ sai, Cloud Tasks entra |
| `apps/worker/.../main.py` | `WorkerSettings` sai; FastAPI com `/internal/transcribe` e `/internal/render` |
| `apps/worker/.../video.py` | Props com URL assinada em vez de `INTERNAL_API_URL` |
| `apps/web/components/ProcessingStatus.tsx` | `EventSource` sai, polling entra |
| `infra/Dockerfile.api` | `alembic` sai do `CMD` |
| `infra/Dockerfile.worker` | Vira dois: `Dockerfile.asr` (GPU, modelos assados) e `Dockerfile.render` (CPU, bundle assado) |

O `docker-compose.yml` **continua existindo e continua sendo o caminho de
desenvolvimento.** Nada aqui pede para desenvolver contra a nuvem — `LocalStorage`
e Postgres local seguem sendo como se roda o projeto na máquina, e é isso que
mantém o `make test` valendo alguma coisa.
