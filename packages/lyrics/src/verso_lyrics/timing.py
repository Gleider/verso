"""Preservar timings quando a letra é corrigida à mão.

Quando o usuário arruma um verso, os timestamps das palavras não podem ser
jogados fora — é deles que a sincronização da fase 2 depende. A solução é um
diff por token: palavra que não mudou mantém o seu timing; palavra nova recebe
um timing interpolado a partir das vizinhas e marca a linha como `needs_realign`.
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


def reconcile_timings(
    old_lines: list[Line],
    new_texts: list[str],
    reviewed_flags: list[bool] | None = None,
) -> list[Line]:
    """Recompõe os versos a partir do texto editado, reaproveitando o que der.

    `new_texts` é a letra como o usuário a deixou, um item por verso; itens
    vazios viram separadores de estrofe em vez de versos. `reviewed_flags`
    acompanha `new_texts` e permite confirmar uma linha sem alterar o texto.
    """
    flags = list(reviewed_flags or [])
    # As linhas em branco somem no parse; as flags precisam acompanhar o mesmo corte.
    kept_flags = [
        flags[i] if i < len(flags) else False
        for i, raw in enumerate(new_texts)
        if raw.strip()
    ]
    parsed = _split_new_lines(new_texts)
    if not parsed:
        return []

    old_words: list[Word] = [word for line in old_lines for word in line.words]

    # Achata os versos novos em tokens, guardando a que linha cada um pertence.
    slots: list[dict] = []
    for line_no, (text, _) in enumerate(parsed):
        for token in text.split():
            slots.append({"line": line_no, "text": token, "start": None, "end": None,
                          "prob": 1.0, "matched": False})

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

        lines.append(
            Line(
                idx=line_no,
                text=text,
                words=words,
                start_ms=words[0].start_ms if words else None,
                end_ms=words[-1].end_ms if words else None,
                starts_stanza=starts_stanza,
                # Só palavra inserida ou trocada exige realinhar; remover não.
                needs_realign=edited,
                reviewed=_is_reviewed(
                    text=text,
                    origin=origin,
                    edited=edited,
                    confirmed=kept_flags[line_no] if line_no < len(kept_flags) else False,
                ),
                # Ajuste de apresentação: corrigir o texto não o invalida.
                nudge_ms=origin.nudge_ms if origin else 0,
            )
        )
    return lines


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
