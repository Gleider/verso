# Verso — plano técnico

**Data:** 2026-09-12 · **Estado:** fase 1 implementada, fases 2–4 esboçadas

Transcreve música em letra editável e sincroniza essa letra com o áudio sobre
uma imagem de fundo.

## Problema

Ferramentas de letra sincronizada existem, mas nenhuma resolve o caminho
completo a partir de um arquivo que você já tem: gerar a letra, deixar você
corrigi-la, e então sincronizá-la palavra a palavra.

## Escolha de linguagem

Python no backend, TypeScript no frontend.

A razão é concreta, não estética: separação de fontes (Demucs), reconhecimento
de fala com timestamp (faster-whisper) e alinhamento forçado (WhisperX, MFA) só
têm implementação madura em Python. Node ou Go acabariam invocando processos
Python de qualquer forma.

O frontend é a exceção. A tela de karaokê da fase 3 depende de Web Audio API,
Canvas e `requestAnimationFrame` com precisão de dezenas de milissegundos.
Frameworks Python de UI (Reflex, NiceGUI) afastam justamente dessas APIs.

## Arquitetura

Pipeline de seis estágios, todos assíncronos:

| # | Estágio | Ferramenta | Papel |
|---|---------|-----------|-------|
| 1 | Ingestão | ffmpeg, mutagen | Hash, tags, WAV 16 kHz mono |
| 2 | Separação | Demucs `htdemucs` | Isola o stem vocal |
| 3 | Detecção de voz | Silero VAD | Marca onde há canto |
| 4 | Transcrição | faster-whisper `large-v3` | Texto + timestamp por palavra |
| 5 | Estruturação | heurística própria | Versos e estrofes pelas pausas |
| 6 | Revisão | Next.js | Correção humana preservando timings |

### Por que o estágio 2 existe

O Whisper foi treinado em fala, não em canto com banda por cima. Com a mixagem
completa ele falha de um jeito previsível: pula versos, inventa frases sobre
solos instrumentais, e transcreve um refrão repetido quatro vezes uma vez só.

Isolar o stem vocal antes entrega ao modelo algo próximo do que ele conhece. O
custo é cerca de um minuto de processamento por faixa, e é a razão de o pipeline
ser assíncrono desde o primeiro dia — três minutos não cabem num request HTTP.

### Ajustes que contêm alucinação

- `vad_filter=True` — o modelo nunca vê silêncio nem instrumental puro.
- `condition_on_previous_text=False` — impede que um erro contamine o resto em loop.
- `word_timestamps=True` — obrigatório; sem isso a fase 2 não existe.
- Palavras com probabilidade `< 0.5` chegam marcadas no editor.

## Modelo de dados

Quatro tabelas: `track`, `processing_job`, `lyrics_version`, `lyric_line`.

A decisão estrutural é o versionamento: **letra nunca é sobrescrita**. A versão
gerada pela máquina e a corrigida pelo usuário coexistem, ligadas por
`parent_id`, e qualquer uma pode ser reativada.

### Preservação de timings na edição

Quando o usuário corrige um verso, os timestamps das palavras não podem ser
descartados — é deles que a fase 2 depende.

`verso_lyrics.timing.reconcile_timings` faz um diff por token com
`difflib.SequenceMatcher`, comparando as palavras normalizadas (sem caixa, sem
pontuação, sem acento):

- palavra inalterada mantém o timing medido;
- palavra inserida ou trocada recebe timing interpolado entre as vizinhas e marca
  a linha com `needs_realign`;
- palavra removida some sem afetar as demais;
- corrigir só pontuação ou capitalização não conta como edição.

Consequência prática: uma correção de ortografia não destrói nada, e a fase 2
sabe exatamente quais versos precisam de alinhamento fino.

## Stack

| Camada | Escolha | Motivo |
|--------|---------|--------|
| API | FastAPI + Pydantic v2 | Gera o OpenAPI de onde saem os tipos do frontend |
| Fila | ARQ + Redis | Nativo de asyncio, bem mais leve que Celery |
| Banco | PostgreSQL 16 | Timings em `JSONB`; busca full-text na fase 4 |
| Migrations | Alembic | Versionadas desde a primeira tabela |
| Separação | demucs (`htdemucs`) | Melhor qualidade aberta; aceita MPS no Mac |
| ASR | faster-whisper | 4x mais rápido que o Whisper de referência |
| Storage | filesystem + Protocol | Trocar por S3 é escrever uma classe |
| Frontend | Next.js 15 + TypeScript | Ecossistema de áudio no navegador |
| Tipos | openapi-typescript | O CI quebra se API e frontend divergirem |

## Roadmap

- **Fase 0 — Fundação.** Monorepo, compose, migrations, CI. *Concluída.*
- **Fase 1 — Upload → letra → edição.** Pipeline completo, versionamento, editor. *Concluída.*
- **Fase 2 — Sincronização fina.** Alinhamento forçado (WhisperX) sobre a letra já
  corrigida; é aqui que os refrões que o Whisper pulou são reencontrados.
- **Fase 3 — Karaokê sobre imagem.** Player com fundo, verso em destaque e
  preenchimento palavra a palavra.
- **Fase 4 — Exportar e compartilhar.** Render de vídeo, busca full-text, contas.

## Riscos

| Risco | Gravidade | Mitigação |
|-------|-----------|-----------|
| Qualidade do ASR em canto | Alta | Demucs antes; conjunto de referência com WER medido; o editor como rede permanente |
| Whisper pula refrões repetidos | Média | Fase 1: correção manual. Fase 2: alinhamento forçado resolve |
| Espera de minutos por faixa | Média | SSE com estágio nomeado; modelo configurável |
| Direitos autorais | Média | Uso pessoal é o caso de uso; publicar letras exige licenciamento |
| Peso do ambiente | Baixa | Volume de modelos; a API não carrega nada de ML |
| Divergência API/frontend | Baixa | Tipos gerados do OpenAPI, verificados no CI |

## Métricas de aceite da fase 1

Medidas sobre o mesmo conjunto de 10 faixas de referência (5 pt, 5 en):

- WER médio **< 25%**
- Tempo mediano de edição humana **< 4 min** por faixa
- Pipeline p95 **< 6 min** para faixa de 5 minutos
- **Zero** texto inventado em trechos instrumentais acima de 10 s

O conjunto de referência e o script de WER devem existir **antes** de qualquer
ajuste de parâmetro do modelo. Sem medição, ajuste é chute caro.

## Decisões tomadas

- **Postgres**, não SQLite — o compose sobe de qualquer forma e evita migrar depois.
- **`large-v3`**, não `distil-large-v3` — qualidade acima de velocidade, conforme pedido.
- **Só o stem vocal é guardado**; os demais são descartados após a separação.
- **Makefile** no lugar de `just`, para não exigir uma ferramenta a mais.

## Pendências da fase 1

O conjunto de 10 faixas de referência e o script de WER (`E4-5` e `E4-6` do
roadmap) não podem ser criados aqui: dependem de faixas reais que o dono do
projeto escolha e de letras verificadas por ele.
