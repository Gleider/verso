# Verso

Transcreve música em letra editável e, depois, sincroniza essa letra com o áudio
sobre uma imagem de fundo — com exportação em vídeo.

Você joga um arquivo de música dentro. O Verso separa a voz do instrumental,
transcreve o que está sendo cantado com timestamp por palavra, e entrega uma
letra que você corrige na tela — sem perder os timings do que já estava certo.

---

## Rodando com Docker

**Único requisito: Docker** (Desktop ou OrbStack). Nada mais precisa estar
instalado — nem Python, nem Node, nem ffmpeg.

```bash
git clone <url-do-repositorio> verso
cd verso
cp .env.example .env
docker compose -f infra/docker-compose.yml --env-file .env up -d --build
```

Abra **http://localhost:3000**.

Sobe cinco serviços: Postgres, Redis, API, worker e a interface. As migrations
do banco rodam sozinhas quando a API inicia.

### Quanto tempo leva

| Etapa | Quando | Duração |
|---|---|---|
| Construção das imagens | só na primeira vez | **10 a 25 min** |
| Download do modelo de transcrição | na primeira música | ~3 GB |
| Transcrição de uma faixa | a cada música | ver abaixo |

A construção demora porque o worker carrega PyTorch, Demucs e faster-whisper
(~2 GB), e porque uma dependência do Demucs precisa ser compilada em Macs com
Apple Silicon. É uma vez só — depois o `up` é instantâneo.

### Portas ocupadas

Se alguma porta já estiver em uso, ajuste no `.env` antes de subir:

```bash
WEB_HOST_PORT=3001
API_HOST_PORT=8001
POSTGRES_HOST_PORT=5433
REDIS_HOST_PORT=6380
```

> A porta da API também é fixada dentro do pacote do navegador durante a
> construção. Se mudar `API_HOST_PORT`, reconstrua: `... up -d --build`.

### Comandos do dia a dia

```bash
# ver o que está acontecendo
docker compose -f infra/docker-compose.yml --env-file .env logs -f worker

# parar tudo (os dados ficam)
docker compose -f infra/docker-compose.yml --env-file .env down

# parar e apagar o banco
docker compose -f infra/docker-compose.yml --env-file .env down -v
```

### Sobre a velocidade da transcrição

**Contêineres não acessam a GPU do Mac.** Dentro do Docker, a separação de voz e
a transcrição rodam em CPU, o que deixa o processamento **várias vezes mais
lento** que nativo — uma faixa de 4 minutos pode levar de 10 a 20 minutos.

Funciona, e para experimentar é suficiente. Se for usar de verdade, vale rodar
**só o worker fora do Docker** (ver a seção seguinte): ele passa a usar a GPU
integrada e cai para poucos minutos por faixa.

**Exceção: GPU NVIDIA.** Em máquinas com NVIDIA (Docker Desktop/WSL2 no
Windows ou Linux nativo com NVIDIA Container Toolkit), o compose já reserva a
GPU para o worker. Basta ajustar no `.env` antes de subir:

```bash
VERSO_WHISPER_DEVICE=cuda
VERSO_WHISPER_COMPUTE=float16
VERSO_DEMUCS_DEVICE=cuda
```

O pipeline inteiro roda na GPU — a transcrição cai para poucos minutos por
faixa sem sair do Docker. Atenção à VRAM: o `large-v3` em float16 pede ~6 GB;
com 6 GB ou menos, prefira `distil-large-v3`. Em Mac (Apple Silicon) essas
variáveis não têm efeito — o MPS não passa para o Docker.

Para acelerar sem sair do Docker, troque o modelo no `.env` antes de subir:

```bash
VERSO_WHISPER_MODEL=distil-large-v3   # ~4x mais rápido, perda modesta de qualidade
```

---

## Rodando sem Docker (mais rápido)

Requer Docker apenas para Postgres e Redis; o resto roda direto na máquina.
Precisa de Python 3.12 (o `uv` baixa se faltar), Node 20+ e `ffmpeg`.

```bash
make setup     # dependências, sem os modelos de ML
make ml        # torch + demucs + faster-whisper (~2 GB)
make up        # Postgres e Redis + migrations

make api       # terminal 1 · http://localhost:8000
make worker    # terminal 2 · consome a fila
make web       # terminal 3 · http://localhost:3000
```

> `uv sync` **sem** `--extra ml` remove os modelos do ambiente. Se a transcrição
> começar a falhar dizendo que o Demucs sumiu, rode `make ml` de novo.

Dá para misturar: subir tudo em contêiner e rodar só o worker nativo, que é onde
a velocidade importa.

---

## O que já funciona

- Upload com deduplicação por hash: o mesmo arquivo nunca processa duas vezes.
- Escolha da origem da letra no envio: **transcrição com IA**, **arquivo .lrc**
  (timing por verso, importado na hora) ou **letra+sync do Musixmatch**
  (título/artista confirmados na tela; a busca sai da API, nunca do browser).
- Pipeline assíncrono de seis estágios, com progresso ao vivo.
- Separação do stem vocal com Demucs **antes** da transcrição.
- Transcrição com faster-whisper, timestamp por palavra.
- Agrupamento automático em versos e estrofes pelas pausas do canto.
- Editor com forma de onda, clique-para-tocar e marcação das palavras de baixa
  confiança.
- Letras versionadas: salvar cria uma versão nova e preserva os timings medidos.
- **Editor de vídeo integrado**, com preview em tempo real: fundo (upload,
  biblioteca ou cor), fonte, nove modos de movimento do texto, posição da
  letra, paletas e oito texturas (grão, VHS, papel, sépia, poeira, retícula,
  vinheta), e templates prontos. Preview e vídeo exportado são a **mesma**
  composição (Remotion) — nunca divergem.
- **Player de karaokê** em tela cheia, com a mesma composição do editor e
  ajuste fino de offset.
- Ajuste de tempo por faixa, com marcação no ritmo.
- **Exportação em MP4** (720p e 1080p, 16:9 e 9:16) e em `.lrc` / `.txt`.

## Estrutura

```
apps/api             FastAPI: rotas, DTOs, SSE. Sem regra de negócio.
apps/worker          ARQ: pipeline de transcrição e render de vídeo (via Remotion).
apps/web             Next.js 15: biblioteca, editor de letra, editor de vídeo, player.
apps/web/composition A definição do vídeo (Remotion) — preview e MP4 exportado.
apps/web/renderer    Script Node que grava o MP4.
packages/core        Modelos, schemas, configuração, storage, preparo de imagem.
packages/audio       ffmpeg, metadados, Demucs.
packages/asr         Protocol Transcriber + faster-whisper.
packages/lyrics      Versos, sílabas, saneamento, diff de timings, export.
```

A regra de fronteira: **lógica de domínio nunca mora em `apps/`**.

## Trabalhando no código

Comece por **[`CLAUDE.md`](CLAUDE.md)** — contexto do projeto para humanos e
agentes — e leia
**[`.claude/rules/pitfalls.md`](.claude/rules/pitfalls.md)** antes de mexer em
qualquer coisa: são as armadilhas que quebram em silêncio.

O plano técnico, com roadmap e riscos, está em
[`docs/specs/2026-09-12-verso-design.md`](docs/specs/2026-09-12-verso-design.md).

```bash
make test        # pytest + vitest
make lint        # ruff
make typecheck   # tsc
```

## Decisões que valem conhecer

**Separar a voz antes de transcrever.** O Whisper foi treinado em fala, não em
canto com banda por cima. Com a mixagem completa ele pula versos, inventa texto
sobre trechos instrumentais e transcreve um refrão repetido uma vez só. Rodar o
Demucs antes custa cerca de um minuto por faixa e muda a natureza do resultado.

**Letra é versionada, nunca sobrescrita.** Ao corrigir um verso, um diff por
token compara o texto antigo com o novo: palavra que não mudou mantém seu
timestamp; palavra nova recebe um timing interpolado e fica marcada para
realinhamento.

**Os ajustes de tempo não apagam o que o modelo mediu.** O offset da faixa e o
ajuste por verso vivem em campos próprios e se somam ao timing original, o que
os torna reversíveis.

## Direitos autorais

Transcrever áudio que você possui, para uso pessoal, é o caso de uso deste
projeto. Distribuir letras para terceiros é outra coisa: letras são obras
protegidas, e serviços que as publicam licenciam esse direito.

O repositório não contém nenhuma letra — as suas ficam no banco local, e
`storage/` (áudio, stems, imagens e vídeos) está fora do controle de versão.
