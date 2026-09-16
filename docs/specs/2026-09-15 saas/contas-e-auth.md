# Contas, autenticação e isolamento

**Data:** 2026-09-15 · **Estado:** proposta · **Entrada:** `spec.md`

Como o Verso passa de "qualquer um que alcance a porta 8000 faz tudo" para um
sistema com contas — e, principalmente, o que quebra no caminho.

---

## 1. A conta

Uma conta é **um pagante**. Sem times, sem organizações, sem convites: isso é uma
tabela nova quando houver cliente pedindo, e complexidade sem retorno agora.

```
account
  id                  uuid          pk
  firebase_uid        text          unique, index
  email               text
  plan_code           text          default 'free'
  stripe_customer_id  text          nullable, unique
  saldo_cache         int           default 0      -- ver creditos-e-cobranca.md §3
  created_at          timestamptz
  deleted_at          timestamptz   nullable
```

E em `track`, a única coluna nova de tenancy do sistema inteiro:

```
track.account_id   uuid  FK -> account(id) ON DELETE CASCADE, index
```

**Só `track` ganha dono.** `processing_job`, `lyrics_version`, `lyric_line` e
`video_project` já pendem dela por FK cascade — repetir `account_id` neles seria
desnormalizar para criar uma segunda fonte de verdade que pode divergir.

---

## 2. A dedup por sha256 precisa mudar, e isto não é detalhe

Hoje, em `packages/core/src/verso_core/models.py`, o hash é `unique=True` global,
e `routers/tracks.py` devolve a `Track` existente quando ele bate, sem
reprocessar. Comportamento correto e desejável num app de um usuário.

Com dois usuários vira **vazamento de dados**: quem sobe um arquivo que outra
pessoa já subiu recebe a faixa dela — com a letra que ela editou, os ajustes de
tempo dela e o projeto de vídeo dela. E pode apagar tudo.

```python
__table_args__ = (UniqueConstraint("account_id", "sha256", name="uq_conta_sha256"),)
```

A economia de disco da dedup global não chega perto de compensar. Se um dia
houver volume que justifique deduplicar o **arquivo** entre contas, isso é outra
coisa — uma tabela de blobs com contagem de referência — e não muda o fato de
cada conta precisar da própria `track`.

---

## 3. Firebase Authentication

### Por que

| Alternativa | Por que não |
|---|---|
| **Clerk, Auth0, WorkOS** | Cobram por usuário ativo. Numa fase cujo objetivo é piso de custo perto de zero, é um custo que cresce exatamente com a métrica que ainda não gera receita. |
| **Supabase Auth** | Traz um segundo Postgres para gerenciar, ou move o nosso — decisão grande demais para resolver autenticação. |
| **Sessão própria (e-mail, senha, tabela)** | Barato de escrever e caro de manter certo: reset de senha, limite de tentativa, verificação de e-mail, vazamento de hash. É o tipo de código em que errar é silencioso. |

O Firebase é grátis na faixa relevante com Google sign-in e e-mail/senha, e a
verificação no backend não custa chamada de rede: o ID token é um JWT assinado
pelo Google, validado contra as chaves públicas, que se cacheiam por horas.

### O fluxo

```
navegador  --login Google/e-mail-->  Firebase
           <---ID token (JWT, 1 h)---
           --Authorization: Bearer-->  FastAPI
                                       valida assinatura, iss, aud, exp
                                       resolve account por firebase_uid
                                       (cria na primeira vez)
```

No FastAPI, uma dependência `conta_atual()` que devolve `Account`, e **um** helper
para carregar faixa:

```python
async def carregar_track(session, track_id: UUID, conta: Account) -> Track:
    """Faixa da conta, ou 404.

    404 e não 403: responder "existe, mas não é sua" já entrega que o
    arquivo existe, que é justamente o que não se quer contar.
    """
```

**Todo router usa esse helper.** Não é estilo — é a única forma de o filtro de
tenancy não depender de alguém lembrar. Com o filtro espalhado em cada
`select(Track)`, esquecer um é invisível: a rota funciona, os testes passam, e ela
devolve dado de outra conta.

A trava é um teste que percorre **cada rota** de `tracks.py`, `lyrics.py` e
`video.py` com uma faixa de outra conta, esperando 404. Vinte e cinco endpoints,
vinte e cinco casos. É chato de escrever uma vez, e é o que impede o pior defeito
que este produto pode ter.

### Server Components

As quatro rotas de `apps/web/app/` são todas `async` e buscam da API
(`lib/server-api.ts`). Elas rodam no servidor e não alcançam o SDK cliente do
Firebase.

Caminho: o ID token vira um **session cookie** do Firebase (httpOnly, `Secure`,
`SameSite=Lax`), escrito por um route handler do Next logo depois do login.
Duração de até 14 dias e revogável — que é exatamente o motivo de esse mecanismo
existir, em vez de guardar num cookie o ID token de 1 hora.

Precisa também de `middleware.ts` (não existe hoje) mandando para o login quem
não tem cookie. Sem ele, a página renderiza uma biblioteca vazia como se a pessoa
simplesmente não tivesse faixa nenhuma — os quatro fetches de hoje engolem erro
com `try/catch` devolvendo `null`/`[]`.

---

## 4. O problema das URLs cruas

Este é o item que mais custa trabalho, e ele não é óbvio até alguém tentar.

`apps/web/lib/api.ts` expõe cinco URLs que **não passam por `fetch`** — vão
direto para atributos de HTML e para o `EventSource`:

| Método | Vai para | Manda header? |
|---|---|---|
| `audioUrl` | `<audio src>` | não |
| `backgroundUrl` | `<img src>`, e o Chromium do render | não |
| `exportUrl` | `<a href>`, baixar `.lrc`/`.txt` | não |
| `renderDownloadUrl` | `<a href>`, baixar o MP4 | não |
| `eventsUrl` | `new EventSource(...)` | **não** — a API do `EventSource` não aceita headers |

Hoje funciona porque a API é aberta. Com autenticação, nenhuma delas funciona.

### As quatro de arquivo: URL assinada do GCS

O endpoint deixa de servir bytes e passa a **autenticar e redirecionar**:

```
GET /tracks/{id}/audio
  → valida o Bearer (ou o cookie)
  → carregar_track(...)                  # 404 se não for da conta
  → 302 Location: <URL assinada V4 do GCS, TTL 15 min>
```

Resolve quatro coisas de uma vez, e três nem eram o objetivo:

1. **autentica** — a checagem acontece antes de assinar;
2. **tira banda do Cloud Run** — o MP4 sai do GCS, não do nosso contêiner. É
   economia direta, e o MP4 é o maior arquivo que o sistema entrega;
3. **resolve o `Range` de graça** — o GCS trata requisição parcial nativamente,
   que é o que o `<audio>` faz quando alguém arrasta a linha do tempo;
4. **dá ao Chromium do render um caminho legítimo.** Hoje
   `apps/worker/src/verso_worker/video.py` monta `audioUrl`/`backgroundUrl` com
   `INTERNAL_API_URL` e o Chromium busca **sem credencial nenhuma** — funciona só
   porque a API é aberta. Com URL assinada, o worker assina antes de montar as
   props e o Chromium busca direto do GCS, sem tocar na API.

O TTL curto é o teto do estrago de um link vazado. Para o render, a assinatura
precisa durar mais que o job: assinar com TTL de algumas horas **só** nesse
caminho, com o porquê escrito no código.

### O SSE: trocar por polling

`routers/jobs.py:38-76` mantém a conexão aberta por até uma hora
(`MAX_STREAM_SECONDS = 3600`), consultando o Postgres **uma vez por segundo, por
cliente**.

Além de o `EventSource` não mandar header, isso tem um custo que só aparece em
Cloud Run: **a CPU é cobrada durante o processamento da requisição, e um stream
SSE é processamento pela duração inteira**. Uma transcrição de 12 minutos com o
usuário olhando a tela são 12 minutos de vCPU faturados **por espectador**, mais
720 consultas num Cloud SQL de núcleo compartilhado.

Trocando por polling de `GET /jobs/{job_id}` a cada 2–3 s com backoff: cerca de
300 requisições de dezenas de milissegundos. Duas ordens de grandeza mais barato,
e o `fetch` manda o header sem problema.

O consumidor é **um só**: `apps/web/components/ProcessingStatus.tsx:19`. A troca é
pequena; o que ela evita não é.

> **Evolução, não v1.** Se um dia quisermos progresso em tempo real de verdade, o
> caminho é o worker escrever no Firestore — que já vem junto com o Firebase Auth
> — e o navegador escutar direto, sem passar pelo Cloud Run. Aí o custo de manter
> a conexão aberta deixa de ser nosso.

---

## 5. Isolamento no storage

As chaves de hoje são planas por `track_id` (`originals/`, `backgrounds/`,
`vocals/`, `renders/`, `work/`). Passam a carregar o tenant:

```
contas/{account_id}/originals/{track_id}.mp3
contas/{account_id}/renders/{track_id}-1080p.mp4
```

Não é organização: é o que permite política de acesso por prefixo no bucket,
apagar uma conta inteira com um `delete` de prefixo (LGPD), e medir armazenamento
por conta sem varrer o banco.

O `remotion-bundle/` e o `musixmatch_session.json`, que hoje moram no mesmo
`storage/`, **não são dado de usuário** e saem de lá — o primeiro vai para a
imagem do worker de render (`infra-gcp.md` §4), o segundo para o Secret Manager.

### O `StorageBackend` precisa crescer

```python
class StorageBackend(Protocol):
    def save(self, key: str, source: BinaryIO) -> None: ...
    def open(self, key: str) -> BinaryIO: ...
    def signed_url(self, key: str, ttl_seconds: int = 900) -> str: ...
    def exists(self, key: str) -> bool: ...
    def delete(self, key: str) -> None: ...
    def delete_prefix(self, prefix: str) -> None: ...
```

Duas mudanças de fôlego em relação ao Protocol atual:

- **`path_for` sai da interface**, e `save` deixa de devolver `Path`. Hoje os dois
  devolvem `Path`, o que vaza a suposição de sistema de arquivos local para todo
  chamador — o docstring do próprio arquivo já antecipava a troca ("trocar o
  disco local por S3 ou MinIO na fase 4"). `LocalStorage` mantém `path_for` como
  método **dele**, não da interface, porque o `ffprobe` e o Demucs precisam de
  caminho de verdade em desenvolvimento.
- **`signed_url` e `delete_prefix` entram**, pelos motivos de §4 e §5.

No worker, o que exige arquivo local (ffmpeg, Demucs, faster-whisper) baixa para o
disco efêmero do contêiner e apaga no `finally` — que é exatamente o que
`pipeline.py` já faz hoje com `storage/work/{track_id}/`.

---

## 6. Exclusão de conta

Requisito de LGPD que sai quase de graça pelo desenho:

1. `DELETE FROM account WHERE id = ...` — o `ON DELETE CASCADE` leva `track`, e a
   cascata de `track` leva jobs, versões, versos e o projeto de vídeo;
2. `storage.delete_prefix(f"contas/{account_id}/")` — leva todos os arquivos;
3. desativar o usuário no Firebase;
4. o cliente no Stripe **não** se apaga: obrigação fiscal exige guardar o
   histórico de pagamento. O que se apaga é o vínculo pessoal — e isso precisa
   estar dito na política de privacidade, não escondido.

O `credit_ledger` cai junto com a conta. Se auditoria exigir retenção, o caminho é
`deleted_at` em vez de `DELETE`, com um job que anonimiza — decisão para quando
houver contador, não agora.
