# Verso — contexto para agentes

Transcreve música em letra editável e a sincroniza como karaokê sobre uma
imagem de fundo, com exportação em MP4.

Uso pessoal, local. Áudio que o dono do projeto possui, processado na máquina
dele. Não há multiusuário, autenticação nem nuvem.

## Leia antes de mexer

| Arquivo | Quando |
|---|---|
| `.claude/rules/pitfalls.md` | **Antes de qualquer mudança.** Armadilhas que quebram em silêncio. |
| `.claude/rules/architecture.md` | Ao criar arquivo, mover código ou tocar em fronteiras. |
| `.claude/rules/domain.md` | Ao mexer em letra, timing, versões ou sincronia. |
| `.claude/rules/conventions.md` | Ao escrever qualquer código. |
| `docs/specs/2026-09-12-verso-design.md` | Plano original, roadmap e decisões. |

## Comandos

Tudo em contêiner (só exige Docker) — é o caminho de quem está chegando:

```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml --env-file .env up -d --build
```

Desenvolvimento local (mais rápido, usa a GPU do Mac no worker):

```bash
make setup     # dependências (sem os modelos de ML)
make ml        # torch + demucs + faster-whisper (~2 GB) — o worker exige
make up        # Postgres e Redis + migrations
make api       # terminal 1 · localhost:8000
make worker    # terminal 2 · confere as dependências antes de subir
make web       # terminal 3 · localhost:3000
make test      # pytest + vitest
make lint      # ruff
make typecheck # tsc do frontend
```

Rodar Python fora do `make`: use `.venv/bin/python`, `.venv/bin/pytest`,
`.venv/bin/ruff`.

## Arquitetura em dez linhas

```
apps/api       FastAPI: rotas, DTOs, SSE. Casca fina.
apps/worker    ARQ: pipeline de transcrição e render de vídeo.
apps/web       Next.js 15: biblioteca, editor de letra, player de karaokê.
packages/core  Modelos SQLAlchemy, schemas Pydantic, config, storage.
packages/audio ffmpeg, metadados, Demucs.
packages/asr   Protocol Transcriber + faster-whisper.
packages/lyrics Agrupamento em versos, silabificação, saneamento, timing, export.
packages/video Render do MP4 (Pillow desenha o texto, ffmpeg compõe).
```

**Regra de fronteira: lógica de domínio nunca mora em `apps/`.** A API e o
worker traduzem protocolo; quem decide é `packages/`.

No frontend, o equivalente: **`apps/web/lib/*.ts` é lógica pura e testada**
(`sync`, `syllables`, `normalize`, `beat`, `effects`). Componentes React apenas
aplicam o que essas funções devolvem.

## As cinco coisas que mais causam estrago

1. **`uv sync` sem `--extra ml` desinstala torch, demucs e faster-whisper.**
   Silenciosamente. Depois a transcrição falha. Rode `make ml` de novo.
2. **Demucs roda antes do Whisper, e isso não é opcional** — é o que separa um
   resultado utilizável de um inútil.
3. **O ffmpeg local não tem `libass` nem `drawtext`.** Não escreva filtro de
   legenda; o texto do vídeo é desenhado com Pillow e enviado por cano.
4. **O browser fala direto com a API**, sem o proxy do Next — `rewrites` derruba
   uploads acima de ~8 MB.
5. **Os timings do Whisper vêm inflados.** Sempre passe por `normalizeWords`
   (TS) / `normalize_words` (Python) antes de usar.

Cada uma está explicada, com o sintoma que produz, em
`.claude/rules/pitfalls.md`.

## Fluxo de dados

```
upload → sha256 (dedup) → job ARQ
  → ffmpeg (WAV 16 kHz mono)
  → Demucs (isola o stem vocal)
  → faster-whisper (VAD + timestamp por palavra)
  → agrupamento em versos/estrofes
  → lyrics_version v1 (source=asr)

editor → PUT /lyrics → diff por token → lyrics_version v2 (source=user_edit)
player → ajustes de tempo → PATCH in-place (NÃO cria versão)
render → job ARQ → Pillow desenha texto → ffmpeg compõe → MP4
```

## Duas regras de conteúdo

- **Nunca comite letras reais.** Testes, fixtures e exemplos usam texto
  inventado. As letras do usuário vivem no banco local dele, nunca no repositório.
- **`storage/` não vai para o git**: áudio, stems, imagens e vídeos ficam fora.

## Idioma

Código, comentários, mensagens de erro, nomes de teste e documentação em
**português do Brasil**. Identificadores de código em inglês quando for o termo
técnico corrente (`start_ms`, `nudge_ms`, `reviewed`).
