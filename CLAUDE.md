# Verso — contexto para agentes

Transcreve música em letra editável, sincroniza como karaokê e monta o vídeo
num editor com preview em tempo real — fundo, fonte, movimento, estrutura e
estilo —, com exportação em MP4.

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
| `docs/specs/2026-09-14 integrated-video-editor/spec.md` | Editor de vídeo integrado: por que Remotion, o desenho do preview/render. |

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
apps/api             FastAPI: rotas, DTOs, SSE. Casca fina.
apps/worker          ARQ: pipeline de transcrição e render de vídeo.
apps/web             Next.js 15: biblioteca, editor de letra, editor de vídeo, player.
apps/web/composition A definição do vídeo (Remotion) — preview E o MP4 exportado.
apps/web/composition/efeitos  Os shaders GLSL: texturas, gradação de cor, fundos gerados.
apps/web/renderer     Script Node (render.mjs) que grava o MP4.
packages/core        Modelos SQLAlchemy, schemas Pydantic, config, storage, preparo de imagem.
packages/audio       ffmpeg, metadados, Demucs.
packages/asr         Protocol Transcriber + faster-whisper.
packages/lyrics      Agrupamento em versos, silabificação, saneamento, timing, export.
```

**Regra de fronteira: lógica de domínio nunca mora em `apps/`.** A API e o
worker traduzem protocolo; quem decide é `packages/`.

No frontend, o equivalente é em dois lugares: **`apps/web/lib/*.ts`**
(`sync`, `syllables`, `normalize`, `beat`, `effects`) e **`apps/web/composition/*.ts`**
(tudo que a composição de vídeo decide — settings, formato, movimento,
textura). Componentes React e os `.tsx` de `composition/` apenas aplicam o
que essas funções devolvem.

`apps/web/composition/` tem seis regras próprias, todas porque quebrá-las
**falha em silêncio**: zero `className`, zero `transition`/`animation` de
CSS, só imports relativos, zero `Math.random`/estado entre quadros, um único
lugar chamando `useAudioData`, lógica em `.ts` e componentes em `.tsx`. Ver
`.claude/rules/architecture.md`.

## As coisas que mais causam estrago

1. **`uv sync` sem `--extra ml` desinstala torch, demucs e faster-whisper.**
   Silenciosamente. Depois a transcrição falha. Rode `make ml` de novo.
2. **Demucs roda antes do Whisper, e isso não é opcional** — é o que separa um
   resultado utilizável de um inútil.
3. **`apps/api` e `apps/worker` rodam em Docker a partir de uma imagem
   construída.** Editar `packages/core`, `apps/api` ou `apps/worker` sem
   reconstruir o contêiner (`docker compose ... up -d --build <serviço>`)
   deixa o código antigo rodando, sem erro nenhum.
4. **O browser fala direto com a API**, sem o proxy do Next — `rewrites` derruba
   uploads acima de ~8 MB.
5. **Os timings do Whisper vêm inflados.** Sempre passe por `normalizeWords`
   (TS) / `normalize_words` (Python) antes de usar.
6. **O pulso da batida nunca dispara no vídeo exportado se a escala do
   espectro estiver errada.** `AnalyserNode` (navegador) e `visualizeAudio`
   (Remotion) usam escalas diferentes — ver `pitfalls.md` §17.
7. **Os efeitos de vídeo exigem `gl: "swangle"` no render.** São shaders GLSL,
   e o Chromium headless sobe sem WebGL2. `angle` funciona na máquina com GPU
   e **falha no contêiner** — mudança na camada de shaders só está pronta
   depois de um render dentro do Docker (`pitfalls.md` §27).
8. **CSS primeiro; shader só para o que amostra pixels.** Montar canvas custa
   o quadro inteiro, a cada quadro, mesmo sem efeito nenhum — já derrubou o
   preview para menos de 10 fps. Cor, grão, vinheta e poeira são `filter` e
   camada de CSS (`pitfalls.md` §28).
9. **Não edite arquivo deste repositório com `Get-Content`/`Set-Content`.** O
   PowerShell 5.1 lê UTF-8 sem BOM como ANSI e destrói os acentos; num `.ps1`,
   o travessão vira aspa e quebra o parser (`pitfalls.md` §30).

Cada uma está explicada, com o sintoma que produz, em
`.claude/rules/pitfalls.md`.

## Fluxo de dados

```
upload → sha256 (dedup) → escolha da origem da letra
  → IA: job ARQ → ffmpeg (WAV 16 kHz mono) → Demucs (isola o stem vocal)
        → faster-whisper (VAD + timestamp por palavra)
        → agrupamento em versos/estrofes → lyrics_version v1 (source=asr)
  → .lrc: parse_lrc (timing por verso) → lyrics_version v1 (source=imported)
  → Musixmatch: confirma título/artista → API busca subtitle.get
        → parse_lrc → lyrics_version v1 (source=musixmatch)

editor de letra → PUT /lyrics → diff por token → lyrics_version v2 (source=user_edit)
editor de vídeo → PUT /video-project → grava settings in-place (NÃO cria versão)
player → ajuste de offset → PATCH in-place (NÃO cria versão)
render → job ARQ → apps/web/renderer/render.mjs (Remotion) → MP4
```

## Duas regras de conteúdo

- **Nunca comite letras reais.** Testes, fixtures e exemplos usam texto
  inventado. As letras do usuário vivem no banco local dele, nunca no repositório.
- **`storage/` não vai para o git**: áudio, stems, imagens e vídeos ficam fora.

## Idioma

Código, comentários, mensagens de erro, nomes de teste e documentação em
**português do Brasil**. Identificadores de código em inglês quando for o termo
técnico corrente (`start_ms`, `nudge_ms`, `reviewed`).
