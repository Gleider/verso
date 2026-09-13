# Convenções

## Idioma

Português do Brasil em código, comentários, mensagens de erro, nomes de teste e
documentação. Identificadores ficam em inglês quando são o termo técnico
corrente (`start_ms`, `nudge_ms`, `reviewed`, `LyricsVersion`).

Acentuação correta sempre — `não`, `versão`, `sílaba`.

## Comentários explicam o porquê

O código já diz o quê. Comentário aqui existe para registrar a decisão que não é
óbvia, e de preferência o que acontece se alguém a desfizer:

```python
# O modelo nunca vê silêncio nem instrumental puro, que é onde ele inventa texto.
vad_filter=True,
```

```ts
// A medida de referência é a altura do viewport, nunca a da lista de versos:
// usar a altura da lista joga o conteúdo para fora da tela.
```

Comentário que narra a linha seguinte (`# incrementa o contador`) é ruído.

## Mensagens de erro dizem o que fazer

Elas chegam na interface. Compare:

```
ruim:  "A separação falhou"
ruim:  "Não foi possível separar o vocal. Tente outro arquivo."   ← mentia sobre a causa
bom:   "O Demucs não está instalado. Rode: uv sync --extra ml"
```

Distinga **dependência faltando** de **problema com o arquivo** — são exceções
diferentes (`SeparationUnavailable` vs `SeparationError`) porque exigem ações
diferentes de quem lê.

## Testes

**TDD para lógica pura.** Escreva o teste antes em: `lyrics` (versos, sílabas,
saneamento, diff de timing), `lib/sync.ts`, `lib/beat.ts`, `lib/effects.ts`,
`lib/normalize.ts`.

Nomes de teste descrevem **comportamento**, não implementação:

```python
def test_linha_editada_fica_marcada_como_revisada():
def test_pontuacao_sozinha_nao_marca_como_revisada():
```

Cubra as bordas que falham calado: lista vazia, duração zero, valores fora de
ordem, fim antes do começo, verso sem timing.

Quando um defeito escapar, **escreva o teste que o impediria** antes de
corrigir. Vários testes deste projeto existem por isso — por exemplo, o que
garante que a amplitude do efeito é grande o bastante para ser vista, e o que
fixa que a centralização não pode depender do tamanho da lista.

**Fixtures nunca usam letras reais.** Todo texto de exemplo é inventado para o
teste, ou vocabulário comum escolhido pelo padrão silábico (`casa`, `cachorro`,
`transporte`). As letras do usuário vivem no banco local dele.

## Verificação antes de dizer "pronto"

```bash
make test       # pytest + vitest
make lint       # ruff
make typecheck  # tsc
```

Para mudança visual, isso **não basta**: renderize e olhe. Dois defeitos reais
deste projeto passaram por toda a suíte e só apareceram quando um quadro foi
extraído e inspecionado.

## Python

- 3.12, `ruff` com `E, F, I, UP, B`, linha de 100.
- `StrEnum` para enums (não `str, Enum`).
- Type hints em assinaturas públicas; `Protocol` para contratos.
- `dataclass(slots=True)` para dados de domínio.
- Async em API e worker; funções puras de domínio são síncronas.

## TypeScript

- `strict`. Sem `any`.
- Lógica em `lib/`, componentes aplicam.
- Componentes React: `function Nome()` exportada, props tipadas com `interface`.
- Nada de re-render em laço de animação — escreva no `style` por `ref`.

## Banco

- Uma migration por mudança, numerada (`0008_...`).
- Enum novo: `autocommit_block` (ver `pitfalls.md` §9).
- `server_default` em coluna nova não-nula, senão a migration falha com dados
  existentes.
- Timestamps em UTC.

## Frontend e API

- O browser chama a API direto. **Não** reintroduza proxy (`pitfalls.md` §4).
- Todo endpoint novo entra em `lib/api.ts` e nos tipos de `lib/types.ts`.
- Estados de carregando, vazio e erro em toda tela.

## Git

- `storage/` fora do repositório: áudio, stems, imagens e vídeos.
- `.env` fora; `.env.example` versionado.
- Modelos de ML em `infra/models/`, fora também.
