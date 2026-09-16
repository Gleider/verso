# Créditos, planos e cobrança

**Data:** 2026-09-15 · **Estado:** proposta · **Entrada:** `spec.md`

O mecanismo de monetização: um só, deliberadamente. Créditos respondem ao mesmo
tempo por assinatura, venda avulsa e Pix — e é por isso que este documento é mais
curto do que a lista de requisitos sugeria.

---

## 1. Onde isto mora

**`packages/billing`**, pacote novo, seguindo a regra de fronteira do projeto:
preço, plano e direito são decisão de domínio e não moram em `apps/`.

| Módulo | Papel |
|---|---|
| `planos.py` | O catálogo. Constantes, não linhas de banco (ver §2). |
| `direitos.py` | `direitos(plan_code, status) -> Direitos`. Função **pura**. |
| `creditos.py` | Custo de um render em créditos, e as regras do ledger. |
| `stripe_client.py` | A casca que fala com o Stripe. É a **única** parte que faz rede. |

Os três primeiros são testáveis sem banco, sem rede e sem Stripe — como
`packages/lyrics`. É isso que permite TDD no que decide quanto o cliente paga,
que é o último lugar onde se quer descobrir um erro em produção.

---

## 2. O catálogo de planos fica em código, não no banco

| Alternativa | Por que não |
|---|---|
| **Tabela `plan` no Postgres** | Preço e direitos passam a mudar sem migration, sem revisão e sem teste. Um `UPDATE` errado numa linha reprecifica todo mundo em silêncio. |
| **Só no Stripe** | O Stripe sabe o preço; ele não sabe "este plano libera partículas". E toda checagem de direito viraria chamada de rede. |

O banco guarda só o **`plan_code`** (`free`, `criador`, `estudio`). O que aquele
código significa é constante versionada, com teste, e muda por deploy — que é a
granularidade certa para uma decisão que afeta faturamento.

O Stripe guarda o preço em dinheiro, porque é ele quem cobra. O vínculo é o
`price_id` mapeado para `plan_code` em `planos.py`.

```python
@dataclass(frozen=True, slots=True)
class Direitos:
    features: frozenset[Feature]
    max_resolution: str              # "720p" | "1080p"
    marca_dagua: bool
    max_duracao_render_ms: int | None
    max_upload_mb: int
    renders_simultaneos: int
    creditos_por_ciclo: int
```

Esboço dos planos em `spec.md` §3.1. Os números são decisão comercial e não devem
ser fixados antes de medir o custo real por render (fase 5).

### Direitos derivam do plano **e** do estado da assinatura

```python
def direitos(plan_code: str, status: SubscriptionStatus) -> Direitos:
    """Assinatura que não está em dia vale como free.

    O período de graça é do Stripe (ele repete a cobrança por dias antes de
    desistir). Quando ele desiste, `past_due` vira `canceled` e cai aqui.
    """
```

Um plano pago com pagamento falhado **não** continua liberando 1080p. Mas os
créditos já concedidos continuam valendo até expirarem — eles foram pagos.

---

## 3. O ledger de créditos

A tabela central, e a decisão mais importante deste documento:

```
credit_ledger                          -- append-only. Nunca UPDATE, nunca DELETE.
  id                uuid         pk
  account_id        uuid         FK -> account, index
  delta             int                      -- + concede, − consome
  reason            enum
  job_id            uuid         nullable    -- FK -> processing_job
  expires_at        timestamptz  nullable    -- null = não expira
  idempotency_key   text         unique, nullable
  created_at        timestamptz
```

`reason` ∈ `plan_grant`, `pack_purchase`, `render_hold`, `render_commit`,
`render_refund`, `manual_adjust`.

### Por que ledger e não um contador

`UPDATE account SET saldo = saldo - 1` é mais simples e não responde a nenhuma
das três perguntas que **vão** aparecer:

- *o render falhou, e agora?* → `render_refund`, e o usuário não paga por um
  defeito nosso;
- *o cliente pediu estorno* → uma entrada que reverte a concessão, com o evento
  do Stripe apontado;
- *o usuário jura que tinha 12 créditos* → a resposta está na tabela, com
  carimbo de tempo.

O custo é uma soma em vez de uma leitura. Resolvido com `account.saldo_cache`,
atualizado **na mesma transação** que grava a entrada, mais um teste que reconcilia
o cache contra a soma. Cache com chave incompleta não falha, mente
(`pitfalls.md` §34) — aqui o antídoto é a reconciliação ser testada, não
confiada.

### Saldo

```
saldo = Σ delta  onde (expires_at IS NULL OR expires_at > agora)
```

Concessão de plano nasce com `expires_at = current_period_end`: **crédito de
assinatura expira no fim do ciclo**, e não acumula indefinidamente. Pacote avulso
nasce com `expires_at = NULL`: foi comprado à parte, não expira.

Consumo tira do que expira primeiro. Isso não precisa de código de alocação: a
soma já dá o saldo certo, e a ordem só importaria se quiséssemos mostrar "seus 3
créditos de assinatura vencem em 8 dias" — que é apresentação, e pode esperar.

---

## 4. Reserva em duas fases: o render pode falhar

```
POST /tracks/{id}/render
  1. direitos(conta) permite esta resolução e esta duração?   → 403 se não
  2. renders em andamento < direitos.renders_simultaneos?     → 429 se não
  3. saldo >= custo?                                          → 402 se não
  4. TRANSAÇÃO: cria ProcessingJob + grava render_hold (−N)
  5. commit
  6. cria a task no Cloud Tasks
```

E no fim do job: sucesso → `render_commit` (delta 0, só marca o desfecho);
falha → `render_refund` (+N).

**Debitar só no fim seria mais simples e estaria errado:** dois renders
disparados juntos passariam os dois pela checagem de saldo antes de qualquer
débito. O hold é o que fecha essa janela.

A ordem dos passos 5 e 6 também é deliberada. Hoje `routers/tracks.py` chama
`pool.enqueue_job` **antes** do `session.commit()` — há uma janela em que o worker
pode pegar o job antes de a linha existir no Postgres. Com Cloud Tasks, que
entrega mais rápido, a janela piora. Commitar primeiro.

### Quanto custa um render

Proporcional a **duração e resolução**, porque é o que o custo real faz — um vídeo
de 4 minutos em 1080p não custa o mesmo que 30 segundos em 720p, e um preço fixo
subsidiaria o caro com o barato até o barato parar de compensar.

```python
def custo_em_creditos(duracao_ms: int, resolucao: str) -> int:
```

Os coeficientes saem da fase 5 (medição), não de palpite. **E o número precisa
aparecer no botão antes de a pessoa clicar**, com o saldo ao lado. Descobrir o
preço depois de gastar é a pior versão disto.

### O que não custa crédito

Só o render consome. Transcrever, importar do Musixmatch, editar letra, ajustar
timing e mexer no editor de vídeo são grátis.

Isso é decisão de produto e também de custo: o editor roda no navegador do
usuário, e a transcrição — que **é** cara — acontece uma vez por faixa, enquanto o
render acontece muitas. Cobrar pela transcrição puniria subir música; cobrar pelo
render cobra pelo que a pessoa veio buscar.

Se a transcrição virar abuso (alguém subindo cem faixas sem nunca exportar), o
controle certo é **limite de faixas por plano**, não crédito — limite não cobra,
só segura.

---

## 5. Stripe

### Os três meios pedidos, numa integração só

| Meio | Como | Observação |
|---|---|---|
| **Cartão** | Checkout Session, modo `subscription` ou `payment` | — |
| **Google Pay** | **automático** | Aparece sozinho no Checkout quando o navegador suporta e o domínio está verificado. **Não se integra separadamente** — não há trabalho a fazer além de verificar o domínio. |
| **Pix** | Checkout Session, modo `payment`, `payment_method_types: ["pix"]` | Confirmação **assíncrona**. Ver abaixo. |

### Pix compra pacote, não assinatura

Pix é um push do pagador: não há como debitar de novo no mês seguinte sem o
usuário agir. Pix recorrente depende de Pix Automático, que a Stripe não oferece.

No modelo de créditos isso deixa de ser limitação de produto: **Pix compra
pacote**, e o pacote não expira. Quem paga por Pix tem a mesma experiência prática
de um assinante, comprando quando o saldo baixa.

Duas consequências na interface, e as duas importam:

- **Nunca liberar otimista.** O crédito entra em `payment_intent.succeeded`, não
  quando o usuário diz que pagou. A tela mostra "aguardando confirmação" com o QR
  e o copia-e-cola.
- **O QR expira** (padrão da ordem de 24 h). A tela precisa dizer até quando, e
  oferecer gerar outro.

### Assinatura

`Checkout Session` em modo `subscription`, e o **Billing Portal** hospedado para
trocar cartão, cancelar e ver faturas. Zero tela nossa para tudo isso — é o maior
atalho disponível, e a alternativa é reimplementar cobrança recorrente.

### Pré-requisito de negócio

Conta Stripe com **entidade brasileira (CNPJ)**, para habilitar Pix e receber em
BRL.

**Plano B, se não houver CNPJ:** Stripe para cartão e assinatura, Mercado Pago só
para o Pix. O custo é dois webhooks e duas conciliações. É por isso que
`stripe_client.py` fica atrás de uma fronteira estreita — trocar ou somar
provedor não deve tocar em `creditos.py`.

---

## 6. Webhooks, e o jeito de não dobrar crédito

`POST /webhooks/stripe`. Rota **sem** autenticação de usuário, com verificação
obrigatória do cabeçalho `Stripe-Signature` — sem isso, qualquer um credita a
própria conta com um POST.

```
webhook_event
  provider      text
  event_id      text         unique      -- a trava
  processed_at  timestamptz
```

**Toda entrada grava aqui antes de tocar no ledger.** O Stripe reenvia eventos
quando não recebe 200 a tempo, e "reenviar" é o comportamento normal dele, não
uma falha. Sem a trava de unicidade, um reenvio credita duas vezes.

| Evento | O que faz |
|---|---|
| `checkout.session.completed` | Pacote comprado → `pack_purchase`, `expires_at = NULL` |
| `invoice.paid` | **Concede o ciclo** → `plan_grant` com `expires_at = current_period_end` |
| `customer.subscription.created/updated/deleted` | Espelha `status` e `plan_code` na tabela `subscription` |
| `invoice.payment_failed` | `past_due`. Os direitos caem para free quando o Stripe desiste |
| `charge.refunded`, `charge.dispute.created` | Reverte a concessão correspondente |

**É `invoice.paid` que concede, não `subscription.created`.** Uma assinatura
existe no instante em que o usuário termina o Checkout; o dinheiro entra depois.
Conceder na criação dá crédito para cartão que vai ser recusado — e a renovação
mensal nem emite `subscription.created`, só `invoice.paid`. Esta linha é a que
mais vale deste documento.

### Espelhar o Stripe, mas não acreditar no espelho

A tabela `subscription` é **cache**, para não consultar a API do Stripe a cada
request. A fonte da verdade é o Stripe. Quando as duas divergirem — e vão, porque
webhook se perde —, a reconciliação é um job periódico que lê as assinaturas
ativas e corrige. Não precisa existir na fase 3; precisa estar previsto.

---

## 7. Onde os direitos são aplicados

Três lugares, e nenhum é redundante:

**1. No painel** (`apps/web/components/video-editor/`): controle sem direito
aparece desabilitado, com o motivo. Nunca escondido — um controle oculto não
vende plano; um controle visível e travado, sim. O padrão já existe no editor: o
controle de peso de fonte é desabilitado quando a família não tem eixo variável
(`pitfalls.md` §25), em vez de deixar um deslizador que não faz nada.

**2. Na API, no `PUT /video-project`**: clampa o que chegou. O painel é sugestão;
`curl` não é.

**3. No worker, antes de montar as props**: e este é o que as pessoas acham
redundante e não é. O `settings` no banco pode ter sido gravado quando o plano era
outro — cancelar assinatura não reescreve os projetos salvos. Sem o clamp aqui, um
ex-assinante continua exportando em 1080p sem marca d'água para sempre.

O padrão já existe em `apps/worker/src/verso_worker/video.py`, que hoje sobrescreve
`video_settings["output"]["resolution"]` com o valor do job. Só precisa crescer
para os outros campos.

> **Armadilha ao implementar o clamp:** montar um ramo de `VideoSettings` pela
> metade produz `NaN` no shader, e `NaN` não desenha nada — sem erro, sem aviso
> (`pitfalls.md` §33). O clamp tem que partir de um `VideoSettings` **completo** e
> substituir campos, nunca montar dicionário parcial.

### A marca d'água

Camada da composição, respeitando as seis regras de `composition/` — decisão em
`.ts`, aplicação em `.tsx`, zero `className`, zero `transition`.

O valor vem do **worker**, junto com as props, nunca do painel. E o preview do
editor mostra a marca para quem está no free: ver na exportação o que não se via
no editor é a mesma classe de defeito que a composição única existe para eliminar.
