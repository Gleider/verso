# Modelo de deploy SaaS

**Data:** 2026-09-15 · **Estado:** **proposta — nada disto existe no código.**
**Documentos irmãos:** `infra-gcp.md`, `contas-e-auth.md`, `creditos-e-cobranca.md`

> **Leia isto primeiro.** Todo o resto desta pasta descreve um produto que ainda
> não foi construído. O Verso de hoje é um app **local, de um usuário só**, e é
> isso que o `CLAUDE.md` descreve corretamente. Nenhuma linha destes quatro
> documentos foi implementada. Se você está aqui procurando como o sistema
> funciona, está na pasta errada.

Transformar o Verso num SaaS pago — um usuário paga, sobe a música dele, monta o
lyric video e exporta — com o menor custo de infraestrutura possível, em Google
Cloud.

---

## 1. Cinco fatos do código que decidem tudo

Não são opiniões sobre arquitetura. São coisas que estão escritas nos arquivos
hoje, e cada uma dita uma parte do desenho.

**1. Não existe usuário.** Nenhuma tabela, nenhuma coluna, nenhuma rota
autenticada. `packages/core/src/verso_core/models.py` tem cinco tabelas
(`track`, `processing_job`, `lyrics_version`, `lyric_line`, `video_project`) e
`track` é a raiz de tudo — sem dono. Qualquer requisição que alcance a porta
8000 lê, edita e apaga qualquer faixa. A premissa está até escrita em dois
comentários idênticos (`routers/video.py:6` e `schemas.py:400`): *"gravação
parcial concorrente não tem quem resolva num app de um usuário só."*

**2. A dedup por `sha256` é global e unique.** `routers/tracks.py` devolve a
`Track` existente quando o hash bate, sem reprocessar. Com dois usuários isso
deixa de ser economia e vira **vazamento**: quem sobe o mesmo MP3 recebe a faixa
do outro, com a letra editada dele e o projeto de vídeo dele.

**3. O `storage/` é um bind mount compartilhado.** `api` e `worker` montam o
mesmo `../storage` no `docker-compose.yml`, e `StorageBackend`
(`packages/core/src/verso_core/storage.py`) devolve `Path` em `save`/`path_for`.
Os dois processos **precisam estar na mesma máquina**. Isso é incompatível com
qualquer coisa serverless.

**4. O worker é um processo de vida longa com `max_jobs = 1`**, numa fila só
(`apps/worker/src/verso_worker/main.py`). Um render espera atrás de uma
transcrição de 20 minutos. E ele precisa de Redis no ar o tempo todo.

**5. Transcrever é caro e lento; renderizar é caro e lento — mas por motivos
diferentes.** Demucs e Whisper querem **GPU** e um modelo de ~3 GB em memória;
o render do Remotion quer **vCPU**, porque `swangle` é rasterização por software
(`pitfalls.md` §27). Hoje os dois moram no mesmo contêiner, dimensionado para o
pior dos dois.

Os fatos 1 e 2 dizem que **tenancy vem antes de tudo**. Os fatos 3, 4 e 5 dizem
que a infra atual não migra para serverless sem mudança — e qual mudança.

---

## 2. As decisões

### 2.1 Créditos como moeda única

Plano mensal concede N créditos que **expiram no fim do ciclo**. Pacote avulso
concede créditos que **não expiram**. Render consome crédito, proporcional à
duração e à resolução.

| Alternativa | Por que não |
|---|---|
| **Contador de renders/mês no plano, e venda avulsa como produto separado** | Dois caminhos de cobrança e dois lugares para errar a contagem. E não responde "comprei avulso, sobrou, uso mês que vem?" sem um terceiro mecanismo. |
| **Só assinatura** | Fecha a porta de entrada mais barata (quem quer *um* vídeo) e torna o Pix um problema: Pix recorrente depende de Pix Automático, que a Stripe não oferece. |

Créditos resolvem os três pedidos com um mecanismo: assinatura, venda avulsa
e Pix. É a decisão que faz o resto do `creditos-e-cobranca.md` ficar curto.

### 2.2 Firebase Authentication

Grátis na faixa que nos interessa, com Google sign-in — e verificar o ID token
no FastAPI é validar um JWT contra as chaves públicas do Google, com cache.
**Nenhuma chamada de rede por request, nenhum serviço nosso a mais.** Clerk e
Auth0 cobram por usuário ativo; Supabase Auth traria um segundo banco.

Detalhe em `contas-e-auth.md`, incluindo o problema que vale metade do
documento: cinco URLs de `lib/api.ts` vão direto para `<audio src>`, `<img src>`,
`<a href>` e `EventSource`, e **nenhuma consegue carregar um header**.

### 2.3 Stripe, com Pix comprando pacote

Uma integração só cobre os três meios pedidos:

- **Cartão** e **assinatura** → Stripe Billing + Checkout.
- **Google Pay** → aparece sozinho no Checkout quando o navegador suporta e o
  domínio está verificado. **Não se integra separadamente.**
- **Pix** → `Checkout Session` em modo `payment`, comprando pacote de créditos.

Pré-requisito de negócio: conta Stripe com **entidade brasileira (CNPJ)**, para
habilitar Pix e receber em BRL. Sem isso o desenho cai para o plano B (Mercado
Pago só para o Pix), descrito em `creditos-e-cobranca.md`.

### 2.4 Cloud Run em tudo, com dois workers em vez de um

O fato 5 acima manda separar. `worker-asr` roda com **GPU L4**, concorrência 1,
escala a zero. `worker-render` roda com **CPU**, concorrência 1, escala a zero.
Duas filas do Cloud Tasks, uma para cada — o que também conserta o problema de
um render esperar atrás de uma transcrição.

### 2.5 Cloud Tasks no lugar de ARQ + Redis

Memorystore não escala a zero e é o maior item fixo evitável do piso de custo.
Cloud Tasks custa ~nada no volume inicial e entrega de graça o que hoje falta:
filas separadas, teto de concorrência por fila, retry com backoff, e
autenticação OIDC entre serviços.

As funções de job (`transcribe_track`, `render_track_video`) **não mudam** — só
muda quem as chama. Detalhe em `infra-gcp.md`.

### 2.6 Musixmatch primeiro, ASR como fallback — e o bloqueio que isso tem

Quando a música já tem letra sincronizada no Musixmatch, **não roda ML nenhum**.
É de longe a maior alavanca de custo unitário que existe, e o cliente já está
escrito (`packages/lyrics/src/verso_lyrics/musixmatch.py`).

**Mas esse cliente usa a API não oficial**, com `usertoken` e um segredo de app
embutido — que está inclusive como default em `config.py:40`, comentado como
*"constante pública do protocolo"*. Isso é aceitável num app pessoal e **não é
aceitável num produto pago**. Ver §5.

---

## 3. O que muda no produto

### 3.1 Planos

Esboço. Os números finais são decisão comercial, não técnica — e não devem ser
fixados antes da fase 5 (§4), porque o custo real por render ainda não foi medido.

| | Free | Criador | Estúdio |
|---|---|---|---|
| Créditos por mês | 3 | 60 | 300 |
| Resolução | 720p | 1080p | 1080p+ |
| Marca d'água | sim | não | não |
| Efeitos GLSL, partículas, visualizador | básico | tudo | tudo |
| Imagem de fundo própria | não (só a biblioteca) | sim | sim |
| Duração do vídeo | 60 s | música inteira | música inteira |
| Renders simultâneos | 1 | 2 | 4 |

Três observações que não são óbvias:

- **O limite de 60 s do free não precisa de código novo.** `output.recorte` já
  existe e já atravessa preview e render (`composition/tempo.ts:janelaDeQuadros`).
  O plano free só fixa o teto do recorte.
- **A marca d'água é uma camada da composição**, respeitando as seis regras de
  `composition/` — decisão em `.ts`, aplicação em `.tsx`, zero `className`.
- **A biblioteca de fundos (`public/fundos/`) é de domínio público ou CC0**, o
  que já foi decidido por outro motivo (`CREDITOS.md`: atribuição de CC BY teria
  de viajar dentro do vídeo). Isso continua valendo e agora também protege o
  plano free.

### 3.2 O furo que precisa fechar junto

`PUT /video-project` grava o `settings` **inteiro** que o cliente mandou, e
`apps/worker/src/verso_worker/video.py` lê exatamente esse JSON para montar as
props do render. Um usuário do plano free pode mandar `resolution: "1080p"`,
desligar a marca d'água e ligar textura GLSL.

O clamp precisa existir em **dois lugares**, e o segundo não é redundância:

1. na API, no `PUT`, para o painel não mostrar estado que não vale;
2. no worker, antes de montar as props, porque o `settings` pode ter sido gravado
   quando o plano era outro — assinatura cancelada não reescreve os projetos
   salvos.

O padrão já existe: `video.py` hoje sobrescreve
`video_settings["output"]["resolution"]` com o valor do job. Só precisa crescer.

### 3.3 O fluxo do usuário novo

```
cadastro (Google ou e-mail)  →  conta criada, plano free, 3 créditos
  → sobe a música
  → busca no Musixmatch (0 crédito)  ou  transcreve com IA (custa mais)
  → edita a letra (0 crédito)
  → monta o vídeo no editor, com preview (0 crédito)
  → exporta  →  aqui, e só aqui, consome crédito
```

**Só o render consome.** Editar letra, ajustar timing e mexer no editor de vídeo
são grátis — são o que faz o produto valer, e são baratos (rodam no navegador do
usuário). Cobrar por eles puniria exatamente o comportamento que queremos.

---

## 4. Faseamento

Cada fase é útil sozinha e nenhuma exige a seguinte. A infra vem por último de
propósito: migrar antes de ter tenancy é migrar duas vezes.

| Fase | O que entra | Depende de nuvem? |
|---|---|---|
| **0 — higiene** | `signed_url` no `StorageBackend` + `GcsStorage`; SSE → polling; migrations fora do `CMD`; `pool_size` fixo; bundle do Remotion assado na imagem | **não** |
| **1 — contas** | `account`, `track.account_id`, `unique(account_id, sha256)`, Firebase Auth, chaves de storage por conta, teste de isolamento em cada rota | só Firebase |
| **2 — `packages/billing`** | Planos, direitos, ledger de créditos, clamp na API e no worker, marca d'água, 402 no enqueue | **não** |
| **3 — Stripe** | Checkout (assinatura e pacote), Pix, webhooks idempotentes, Billing Portal | Stripe |
| **4 — GCP** | Cloud Tasks, os dois workers, Cloud Run + Cloud SQL + GCS, Cloud Build | sim |
| **5 — medir e precificar** | Custo real por render; preço do crédito | sim |

**A fase 0 inteira roda com `make test`, `make lint` e `make typecheck`, sem
nenhuma conta de nuvem.** Ela é melhoria pura do que já existe: cada item resolve
um problema que o app local também tem. É por onde começar mesmo que a decisão de
virar SaaS não se confirme.

**A fase 5 não é burocracia.** Precificar o crédito sem medir o custo é dar um
render por errado. O arnês para medir já existe — `scripts/fumaca-render.sh`,
rodando dentro do contêiner — e o que falta é rodá-lo contra o dimensionamento
real do Cloud Run e somar GPU-segundo, vCPU-segundo e egress.

---

## 5. Pendências que bloqueiam a venda, e nenhuma se resolve com código

Este bloco existe porque é o mais fácil de esquecer e o mais caro de descobrir
tarde.

**Direitos autorais.** O `CLAUDE.md` descreve o Verso como *"áudio que o dono do
projeto possui, processado na máquina dele"*. Um SaaS processa áudio de terceiro
e devolve um derivado com a letra. Precisa de: Termos de Uso com declaração de
titularidade ou licença pelo usuário, canal de notificação e retirada, e a
decisão de **não hospedar nem distribuir publicamente** stems e MP4s. Hoje não há
compartilhamento nenhum no produto — manter assim é a posição mais defensável, e
é de graça. Isto precisa de advogado, não de arquiteto.

**Musixmatch não oficial.** §2.6. Usar comercialmente o cliente atual é risco
contratual e operacional (o `usertoken` pode ser revogado a qualquer momento, e aí
o caminho mais barato do produto para de funcionar sem aviso). O caminho é migrar
para a API comercial licenciada, ou tirar o recurso. **Decidir antes da fase 3**,
porque muda a estrutura de custo que define o preço.

**LGPD.** Política de privacidade, exclusão de conta que apague de verdade — o
`ON DELETE CASCADE` já resolve o banco, e o prefixo por conta no GCS fecha os
arquivos —, e **declaração de subprocessador** se a transcrição for para uma API
de terceiro (`infra-gcp.md` §5).

**Obrigação fiscal.** Nota fiscal de serviço e ISS para SaaS no Brasil.

---

## 6. O que estes documentos deliberadamente não fazem

- **Não fixam preço.** Nem do plano, nem do crédito, nem do GCP. Todo número de
  custo aqui é ordem de grandeza com data, para conferir na calculadora.
- **Não desenham telas.** Cadastro, paywall, tela de planos e histórico de
  créditos são trabalho de produto, e vêm depois da fase 2.
- **Não preveem times nem organizações.** Uma conta é um pagante. Adicionar
  membros depois é uma tabela nova; adicionar antes é complexidade sem cliente.
- **Não tratam de e-mail transacional** (recibo, aviso de falha de pagamento). O
  Stripe cobre o essencial de cobrança; o resto entra quando houver o que dizer.
