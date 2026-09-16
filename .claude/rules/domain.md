# Domínio

As regras aqui não são dedutíveis do schema. Quase toda decisão de modelagem
deste projeto existe por um motivo concreto, e mudá-la sem saber o motivo quebra
algo distante.

## Separar a voz antes de transcrever

O Whisper foi treinado em fala, não em canto com banda por cima. Com a mixagem
completa ele falha de um jeito previsível: pula versos, inventa texto sobre
trechos instrumentais e transcreve um refrão repetido quatro vezes uma vez só.

Isolar o stem vocal com Demucs antes muda a natureza do problema. Custa cerca de
um minuto por faixa e **é a razão de o pipeline ser assíncrono**.

Três ajustes no transcritor não são preferência — contêm alucinação:

- `vad_filter=True`: o modelo nunca vê silêncio nem instrumental puro, que é
  onde ele inventa texto.
- `condition_on_previous_text=False`: impede que um erro contamine todos os
  segmentos seguintes em cascata.
- `word_timestamps=True`: **obrigatório**. Sem isso não há karaokê, e
  reprocessar a faixa inteira é o único conserto.

## Letra é versionada; timing não

Esta é a decisão estrutural do projeto.

| Ação | Efeito |
|---|---|
| Editar o **texto** (`PUT /lyrics`) | cria `lyrics_version` nova, a anterior fica acessível |
| Importar letra de fora | cria versão nova (`source=imported`) |
| Acrescentar ou remover um verso | cria versão nova — é estrutura, não tempo |
| Ajustar **tempo** (offset ou nudge) | altera **in-place**, sem versão nova |
| Descartar uma versão (`DELETE .../versions/{id}`) | apaga, e a mais recente que sobrou assume |

O motivo: versionamento é sobre **o que a letra diz**. Sincronia fina é um
ajuste contínuo — uma versão por toque de tecla encheria o histórico de ruído.

**É essa regra que o editor de letra aplica ao salvar** (`lib/rascunho.ts:oQueSalvar`):
mexeu no texto, na estrutura ou fixou um tempo à mão, sai `PUT /lyrics` e nasce
uma versão; mexeu só nos tempos, sai `PATCH /lyrics/nudges` e nada é versionado.

### Mudar o timestamp de um verso é `nudge`, não sobrescrita

O editor mostra o tempo **efetivo** (`medido + nudge − offset`), o mesmo que o
vídeo desenha, e digitar um tempo novo ali vira `nudge_ms` — nunca um
`UPDATE` no `start_ms` medido. Consequências que são o ponto:

- o ajuste é reversível e o dado do modelo continua servindo para medir
  qualidade, como manda a seção dos três controles de tempo;
- o alcance é o do `nudge` (±30 s). Deslocamento maior que isso é deriva da
  faixa inteira, e o lugar dela é o `lyrics_offset_ms`.

A exceção é o **ponto de legenda novo**: ali não existe nada medido para
preservar, então o tempo escrito à mão vai direto em `start_ms`, com
`needs_realign = true` registrando que ninguém mediu aquele instante.

## Editar texto não pode destruir timing

Quando o usuário corrige um verso, os timestamps das palavras **não** podem ser
descartados: é deles que depende todo o karaokê.

`verso_lyrics.timing.reconcile_timings` faz um diff por token
(`difflib.SequenceMatcher`) sobre palavras normalizadas — sem caixa, sem
pontuação, sem acento:

- palavra inalterada **mantém** o timing medido;
- palavra inserida ou trocada recebe timing interpolado entre as vizinhas e
  marca a linha com `needs_realign`;
- palavra removida some sem afetar as demais;
- corrigir **só** pontuação ou capitalização **não** conta como edição.

Consequência: uma correção de ortografia não destrói nada, e a fase 2 saberá
exatamente quais versos precisam de alinhamento fino.

## Os três controles de tempo se somam

```
tempo exibido = timing medido + nudge_ms (do verso) − lyrics_offset_ms (da faixa)
```

- **`lyrics_offset_ms`** (em `track`): deriva constante da faixa inteira.
  **Positivo adianta** a letra.
- **`nudge_ms`** (em `lyric_line`): ajuste de um verso específico, para o trecho
  que saiu do lugar.
- Ambos ficam **separados do timing medido**, nunca sobrescrevem. Assim o ajuste
  é reversível, os dados do modelo continuam servindo para medir qualidade, e o
  alinhamento forçado da fase 2 poderá corrigir os originais sem apagar o que foi
  acertado de ouvido.

A mesma soma vale no `.lrc` exportado e no MP4 — o arquivo sai como o usuário
ouviu, não como o modelo mediu.

## `reviewed`: a confiança do modelo tem prazo

Cada palavra traz a probabilidade do Whisper, e abaixo de `0.5` ela aparece
marcada no editor. Mas **essa marcação vale só até um humano olhar**.

`lyric_line.reviewed` marca que alguém validou aquele verso. Regras:

- editar o texto conta como validação;
- confirmar explicitamente (sem digitar) também — é o caso "ouvi, está certo",
  para a palavra que o modelo duvidou mas está correta;
- mudar só pontuação **não** conta;
- a marca sobrevive aos salvamentos seguintes.

Uma linha revisada some do contador de pendências e perde o destaque vermelho.

## Duas granularidades de tempo, e a segunda é a que quebra

Uma letra aqui tem timing **por palavra** (veio do ASR) ou **por verso** (veio
de `.lrc` ou do Musixmatch: `words` vazio, tempo só em `start_ms`, e `end_ms`
nem existe — o LRC não mede fim).

Todo código que consome timing responde pelas duas. Quem esquece a segunda não
recebe erro: recebe um vídeo com a letra inteira amontoada no começo
(`pitfalls.md` §35) ou uma tela sem letra nenhuma. `reconcile_timings` preserva
a granularidade de entrada — letra por verso continua saindo por verso,
palavra nenhuma inventada.

## Saneamento dos timings

Antes de virar destaque, os timings passam por `normalize_words` /
`normalizeWords`. Ver `pitfalls.md` §5 para o porquê.

Corrige **duração**, nunca **posição**: silêncio real entre palavras é preservado.

## Silabificação e distribuição de tempo

Preencher a palavra linearmente faz o destaque escorregar, porque canto não é
uniforme. A palavra é dividida em sílabas e cada uma recebe a fatia de tempo que
realmente ocupa, com peso por:

- **tônica** (maior fator; detectada por acento gráfico ou pelas regras de
  acentuação do português);
- **ditongo** (duas vogais no mesmo núcleo);
- **coda** (sílaba travada por consoante);
- **posição final** da palavra.

Dois invariantes protegidos por teste: as sílabas concatenadas reproduzem a
palavra exata, e os segmentos são contíguos — um buraco de milissegundos faria o
destaque sumir por um instante.

## Estados

```
track:  uploaded → processing → ready | failed
job:    queued → running → done | failed
job.kind: transcribe | align (fase 2) | render
lyrics_version.source: asr | user_edit | imported | musixmatch
```

Só **uma** `lyrics_version` por faixa tem `is_active = true`.

## Limite conhecido

A precisão do destaque depende dos timings do Whisper, que erram na casa dos
100–300 ms porque derivam dos pesos de atenção do modelo, não de análise
acústica. O offset global corrige desvio constante; o nudge corrige trechos.

Desvio que **varia ao longo da música** não tem conserto manual viável — é o que
o alinhamento forçado da fase 2 (WhisperX) resolve, derrubando o erro para
20–50 ms. A estrutura já está pronta para recebê-lo: `needs_realign` diz quais
versos precisam, e os ajustes manuais vivem em campos separados que não serão
apagados.
