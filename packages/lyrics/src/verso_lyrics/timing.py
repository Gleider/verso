"""Preservar timings quando a letra é corrigida à mão.

Quando o usuário arruma um verso, os timestamps das palavras não podem ser
jogados fora — é deles que a sincronização da fase 2 depende. A solução é um
diff por token: palavra que não mudou mantém o seu timing; palavra nova recebe
um timing interpolado a partir das vizinhas e marca a linha como `needs_realign`.

Letra importada (.lrc, Musixmatch) não tem palavra nenhuma: o tempo dela é por
VERSO. Esse caso tem um caminho próprio aqui — ver `_line_anchors`.
"""

from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher

from verso_asr.base import Word

from verso_lyrics.grouping import Line

# Duração presumida de uma palavra sem nenhuma âncora à frente.
DEFAULT_WORD_MS = 300

_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)


def normalize(token: str) -> str:
    """Forma de comparação: sem caixa, sem pontuação, sem acento.

    Corrigir apenas a pontuação ou a capitalização não conta como edição — e,
    portanto, não descarta o timing medido.
    """
    lowered = unicodedata.normalize("NFD", token.casefold())
    stripped = "".join(ch for ch in lowered if unicodedata.category(ch) != "Mn")
    return _PUNCT.sub("", stripped)


def _normalized_text(text: str) -> str:
    """Texto comparável: só as palavras, sem caixa, acento ou pontuação."""
    return " ".join(normalize(token) for token in text.split())


def _split_new_lines(raw_lines: list[str]) -> list[tuple[str, bool]]:
    """Descarta linhas em branco, transformando-as em marca de estrofe."""
    result: list[tuple[str, bool]] = []
    pending_stanza = True
    for raw in raw_lines:
        text = raw.strip()
        if not text:
            pending_stanza = True
            continue
        result.append((text, pending_stanza))
        pending_stanza = False
    if result:
        text, _ = result[0]
        result[0] = (text, True)  # a primeira linha sempre abre uma estrofe
    return result


def _interpolate(pending: list[dict], before: Word | None, after: Word | None) -> None:
    """Espalha um trecho de palavras sem timing entre as duas âncoras conhecidas."""
    count = len(pending)
    if before is not None and after is not None:
        start, end = before.end_ms, after.start_ms
    elif before is not None:
        start = before.end_ms
        end = start + DEFAULT_WORD_MS * count
    elif after is not None:
        end = after.start_ms
        start = max(0, end - DEFAULT_WORD_MS * count)
    else:
        start, end = 0, DEFAULT_WORD_MS * count

    span = max(0, end - start)
    step = span / count if count else 0
    for position, slot in enumerate(pending):
        slot["start"] = int(start + step * position)
        slot["end"] = int(start + step * (position + 1))


def _kept(values: list | None, new_texts: list[str], default):
    """Recorta uma lista paralela a `new_texts` do mesmo jeito que o parse recorta.

    As linhas em branco somem no parse (viram marca de estrofe); tudo que o
    editor manda por linha precisa acompanhar exatamente o mesmo corte, senão o
    ajuste de um verso cai sobre o vizinho.
    """
    items = list(values or [])
    return [
        items[i] if i < len(items) else default
        for i, raw in enumerate(new_texts)
        if raw.strip()
    ]


def _line_anchors(line: Line, assumed_end: int | None) -> list[Word]:
    """Âncoras sintéticas para um verso que tem tempo, mas não tem palavras.

    Letra de .lrc ou do Musixmatch é medida por VERSO. Sem estas âncoras o diff
    por token não tem em que se apoiar: `old_words` sai vazio, nada casa, e a
    interpolação recomeça a letra inteira do zero — a música inteira ia parar
    nos primeiros trinta segundos, sem erro nenhum.

    Elas existem só para ancorar a comparação. O verso reconstruído volta a sair
    sem palavras, em `reconcile_timings`.
    """
    tokens = line.text.split()
    if line.start_ms is None or not tokens:
        return []
    fallback = line.start_ms + DEFAULT_WORD_MS * len(tokens)
    end = line.end_ms or assumed_end or fallback
    if end <= line.start_ms:
        end = fallback
    step = (end - line.start_ms) / len(tokens)
    return [
        Word(
            text=token,
            start_ms=int(line.start_ms + step * position),
            end_ms=int(line.start_ms + step * (position + 1)),
            probability=1.0,
        )
        for position, token in enumerate(tokens)
    ]


def _shift_to(words: list[Word], start_ms: int) -> list[Word]:
    """Move o verso inteiro para começar em `start_ms`, sem esticar nada."""
    if not words:
        return words
    delta = start_ms - words[0].start_ms
    return [
        Word(
            text=word.text,
            start_ms=word.start_ms + delta,
            end_ms=word.end_ms + delta,
            probability=word.probability,
        )
        for word in words
    ]


def reconcile_timings(
    old_lines: list[Line],
    new_texts: list[str],
    reviewed_flags: list[bool] | None = None,
    *,
    pinned_ms: list[int | None] | None = None,
    nudges_ms: list[int | None] | None = None,
    stanza_flags: list[bool] | None = None,
) -> list[Line]:
    """Recompõe os versos a partir do texto editado, reaproveitando o que der.

    `new_texts` é a letra como o usuário a deixou, um item por verso; itens
    vazios viram separadores de estrofe em vez de versos. As listas opcionais
    acompanham `new_texts` item a item:

    - `reviewed_flags` confirma uma linha sem alterar o texto;
    - `pinned_ms` é o tempo que a pessoa fixou à mão — ponto de legenda novo ou
      verso arrastado no editor. Vence o timing medido;
    - `nudges_ms` é o ajuste manual de cada verso vindo do editor. Sem ele o
      ajuste é herdado pela POSIÇÃO, e inserir um verso no topo empurraria o
      ajuste de todos os de baixo para o verso errado;
    - `stanza_flags` preserva as marcas de estrofe que o editor já conhece.
    """
    kept_flags = _kept(reviewed_flags, new_texts, False)
    kept_pins = _kept(pinned_ms, new_texts, None)
    kept_nudges = _kept(nudges_ms, new_texts, None)
    kept_stanzas = _kept(stanza_flags, new_texts, None)
    parsed = _split_new_lines(new_texts)
    if not parsed:
        return []

    # Achata as palavras antigas, guardando de que verso cada uma veio e se foi
    # medida de verdade ou sintetizada a partir do tempo do verso.
    old_words: list[Word] = []
    word_origin: list[int] = []
    word_measured: list[bool] = []
    for position, line in enumerate(old_lines):
        if line.words:
            for word in line.words:
                old_words.append(word)
                word_origin.append(position)
                word_measured.append(True)
            continue
        assumed_end = next(
            (other.start_ms for other in old_lines[position + 1 :] if other.start_ms is not None),
            None,
        )
        for anchor in _line_anchors(line, assumed_end):
            old_words.append(anchor)
            word_origin.append(position)
            word_measured.append(False)

    # Letra inteira medida por verso: o resultado também sai por verso.
    by_line_only = bool(old_lines) and not any(line.words for line in old_lines)

    # Achata os versos novos em tokens, guardando a que linha cada um pertence.
    slots: list[dict] = []
    for line_no, (text, _) in enumerate(parsed):
        for token in text.split():
            slots.append({"line": line_no, "text": token, "start": None, "end": None,
                          "prob": 1.0, "matched": False, "measured": False, "origin": None})

    matcher = SequenceMatcher(
        a=[normalize(word.text) for word in old_words],
        b=[normalize(slot["text"]) for slot in slots],
        autojunk=False,
    )

    for tag, i1, i2, j1, _j2 in matcher.get_opcodes():
        if tag != "equal":
            continue  # 'replace', 'insert' e 'delete' ficam para a interpolação
        for offset in range(i2 - i1):
            source, slot = old_words[i1 + offset], slots[j1 + offset]
            slot["start"] = source.start_ms
            slot["end"] = source.end_ms
            slot["prob"] = source.probability
            slot["matched"] = True
            slot["measured"] = word_measured[i1 + offset]
            slot["origin"] = word_origin[i1 + offset]

    # Preenche os buracos, um trecho contíguo por vez.
    anchors = [
        Word(text=s["text"], start_ms=s["start"], end_ms=s["end"], probability=s["prob"])
        if s["matched"]
        else None
        for s in slots
    ]
    index = 0
    while index < len(slots):
        if slots[index]["matched"]:
            index += 1
            continue
        run_end = index
        while run_end < len(slots) and not slots[run_end]["matched"]:
            run_end += 1
        before = next((anchors[k] for k in range(index - 1, -1, -1) if anchors[k]), None)
        after = next((anchors[k] for k in range(run_end, len(slots)) if anchors[k]), None)
        _interpolate(slots[index:run_end], before, after)
        index = run_end

    # Redistribui os tokens nos versos novos.
    lines: list[Line] = []
    fixados: set[int] = set()
    for line_no, (text, starts_stanza) in enumerate(parsed):
        mine = [slot for slot in slots if slot["line"] == line_no]
        words = [
            Word(
                text=slot["text"],
                start_ms=int(slot["start"] or 0),
                end_ms=int(slot["end"] or 0),
                probability=float(slot["prob"]),
            )
            for slot in mine
        ]
        edited = any(not slot["matched"] for slot in mine)
        origin = old_lines[line_no] if line_no < len(old_lines) else None
        pin = kept_pins[line_no] if line_no < len(kept_pins) else None

        start_ms = words[0].start_ms if words else None
        end_ms = words[-1].end_ms if words else None

        # Verso que veio de letra medida por verso volta a sair por verso.
        # Inventar palavras aqui seria fingir uma precisão que ninguém mediu, e
        # `composition/versos.ts` já sabe desenhar o verso inteiro sem `words`.
        heranca = [slot["origin"] for slot in mine if slot["matched"] and not slot["measured"]]
        sem_medida = not any(slot["matched"] and slot["measured"] for slot in mine)
        if mine and sem_medida and (by_line_only or heranca):
            words = []
            intacto = (
                len(heranca) == len(mine)
                and len(set(heranca)) == 1
                and len(mine) == len(old_lines[heranca[0]].text.split())
            )
            if intacto:
                # Verso inalterado: o tempo sai copiado como estava, inclusive o
                # fim ausente — .lrc não mede fim, e inventar um seria mentira.
                fonte = old_lines[heranca[0]]
                start_ms, end_ms = fonte.start_ms, fonte.end_ms
            else:
                start_ms = min(int(slot["start"] or 0) for slot in mine)
                end_ms = max(int(slot["end"] or 0) for slot in mine)

        if pin is not None:
            # O tempo fixado à mão vence o que o modelo mediu.
            deslocamento = pin - start_ms if start_ms is not None else 0
            words = _shift_to(words, pin)
            end_ms = end_ms + deslocamento if end_ms is not None else None
            start_ms = pin
            fixados.add(line_no)

        lines.append(
            Line(
                idx=line_no,
                text=text,
                words=words,
                start_ms=start_ms,
                end_ms=end_ms,
                starts_stanza=(
                    kept_stanzas[line_no]
                    if line_no < len(kept_stanzas) and kept_stanzas[line_no] is not None
                    else starts_stanza
                ),
                # Só palavra inserida ou trocada exige realinhar; remover não.
                # Tempo fixado à mão também: ninguém mediu aquele instante.
                needs_realign=edited or pin is not None,
                reviewed=_is_reviewed(
                    text=text,
                    origin=origin,
                    edited=edited,
                    confirmed=kept_flags[line_no] if line_no < len(kept_flags) else False,
                ),
                # Ajuste de apresentação: corrigir o texto não o invalida.
                nudge_ms=(
                    kept_nudges[line_no]
                    if line_no < len(kept_nudges) and kept_nudges[line_no] is not None
                    else (origin.nudge_ms if origin else 0)
                ),
            )
        )

    _close_open_ends(lines, fixados)
    return lines


def _close_open_ends(lines: list[Line], fixados: set[int]) -> None:
    """Dá um fim plausível ao verso sem palavras que foi fixado à mão.

    Um ponto de legenda novo não tem duração medida. Sem fim nenhum, o
    preenchimento do karaokê completa de imediato e o verso fica parado em 100%
    até o próximo — o palpite abaixo ao menos acompanha o tamanho do texto.

    Só vale para os versos fixados à mão. Verso importado que ninguém tocou
    continua com `end_ms=None`: o .lrc não mede fim, e inventar um aqui mudaria
    calado o dado de toda letra importada.
    """
    for position, line in enumerate(lines):
        if position not in fixados or line.end_ms is not None or line.words:
            continue
        if line.start_ms is None:
            continue
        palpite = line.start_ms + DEFAULT_WORD_MS * max(1, len(line.text.split()))
        proximo = next(
            (
                other.start_ms
                for other in lines[position + 1 :]
                if other.start_ms is not None and other.start_ms > line.start_ms
            ),
            None,
        )
        line.end_ms = min(palpite, proximo) if proximo is not None else palpite


def _is_reviewed(*, text: str, origin: Line | None, edited: bool, confirmed: bool) -> bool:
    """Decide se um humano já validou esta linha.

    Mexer no texto vale como validação: se você corrigiu o verso, a incerteza do
    modelo sobre ele deixa de importar. Trocar só pontuação ou caixa não conta.
    """
    if confirmed or edited:
        return True
    if origin is None:
        return True  # a estrutura da letra mudou; esta linha é nova
    if _normalized_text(text) != _normalized_text(origin.text):
        return True  # palavras removidas, por exemplo
    return origin.reviewed  # intacta: mantém o que já era
