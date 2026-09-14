# Arquitetura

## A regra de fronteira

**Lógica de domínio nunca mora em `apps/`.**

`apps/api` e `apps/worker` traduzem protocolo: recebem HTTP ou um job, chamam
`packages/`, devolvem resposta. Se você está escrevendo uma decisão de negócio
dentro de um router, ela está no lugar errado.

No frontend a regra tem um espelho: **`apps/web/lib/*.ts` é lógica pura e
testada**; componentes React apenas aplicam o que essas funções devolvem. Se um
componente está calculando, esse cálculo pertence a `lib/`.

Essa separação é o que permite testar o coração do produto sem banco, sem
navegador e sem áudio.

## Pacotes

| Pacote | Responsabilidade | Não faz |
|---|---|---|
| `core` | Modelos SQLAlchemy, schemas Pydantic, config, storage | nada de áudio ou texto |
| `audio` | ffmpeg, metadados, Demucs | não conhece banco |
| `asr` | `Protocol` Transcriber + faster-whisper | não conhece banco |
| `lyrics` | versos, sílabas, saneamento, diff de timing, export, import .lrc, client Musixmatch | não conhece banco nem áudio |
| `video` | render do MP4, preparo de imagem | não conhece banco |

Apenas `core` conhece o banco. Os demais recebem e devolvem dados simples — é
por isso que os testes deles não precisam de fixture de banco.

## Contratos, não implementações

`asr` expõe um `Protocol`, não uma classe concreta. Trocar faster-whisper por
uma API paga, ou pelo alinhamento forçado da fase 2, não deve tocar em nenhum
caso de uso. O mesmo vale para `StorageBackend` em `core/storage.py`: o disco
local é uma implementação, não a interface.

## Lógica duplicada entre TS e Python — de propósito

Dois módulos existem nas duas linguagens, porque o player e o vídeo exportado
precisam produzir **exatamente** o mesmo karaokê:

| Frontend | Backend |
|---|---|
| `apps/web/lib/syllables.ts` | `packages/lyrics/src/verso_lyrics/syllables.py` |
| `apps/web/lib/normalize.ts` | `packages/lyrics/src/verso_lyrics/normalize.py` |

**Mudou um, mude o outro.** Os testes são espelhados caso a caso
(`syllables.test.ts` ↔ `test_syllables.py`) justamente para a divergência
aparecer como falha, não como diferença visual sutil no vídeo.

Se um dia a fase 2 exigir mais lógica compartilhada, a saída limpa é mover a
silabificação para o backend e o frontend consumir o resultado pronto — mas isso
é uma refatoração consciente, não algo para fazer de passagem.

## Assíncrono desde o primeiro dia

Transcrever leva minutos. Nada disso cabe num request HTTP.

- `POST /tracks` responde `202` imediatamente com `track_id` e `job_id`.
- O trabalho pesado roda no worker (ARQ + Redis), um job por vez —
  Demucs e Whisper já ocupam a máquina inteira.
- O progresso vai ao banco (`processing_job.stage` e `progress`) e chega ao
  navegador por **SSE** (`GET /tracks/{id}/events`).

O render de vídeo usa o mesmo mecanismo, com `kind=render` e o caminho do
arquivo em `output_key`.

## Como o vídeo é montado

O ffmpeg local não tem filtro de legenda (ver `pitfalls.md` §3), então:

1. `verso_video.frames.LyricsLayer` desenha **só a faixa inferior** da tela com
   Pillow — desenhar a tela inteira a cada quadro seria três vezes o trabalho
   pelo mesmo resultado.
2. Os quadros RGBA vão por cano para o ffmpeg.
3. O ffmpeg aplica o efeito no fundo e compõe com `overlay`.

O `stderr` do ffmpeg vai para **arquivo**, não para um cano: um cano cheio
travaria o processo enquanto ainda estivéssemos escrevendo quadros do outro lado.

## Desempenho no player

O loop de animação é um só, em `requestAnimationFrame`. Três regras que o
mantêm barato:

1. **Estado do React só muda quando o verso muda** — não a cada quadro.
2. **Barra de progresso, destaque de sílaba e efeito da imagem são escritos
   direto no `style`**, sem passar pelo React.
3. **Busca binária** para achar o verso e a sílaba atuais, nunca varredura.

O `timeupdate` do HTML5 não serve: dispara ~4 vezes por segundo e faz a letra
pular. O tempo é lido do elemento de áudio a cada quadro.

## Onde ficam as coisas

```
CLAUDE.md                    entrada para agentes
.claude/rules/               regras detalhadas (este diretório)
docs/specs/                  plano técnico e decisões
tests/                       pytest — domínio Python
apps/web/lib/__tests__/      vitest — lógica pura do frontend
apps/api/migrations/         alembic
infra/                       docker compose e Dockerfiles
storage/                     dados locais — fora do git
```
