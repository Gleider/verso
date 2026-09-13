"""Transformar as palavras soltas do ASR em versos e estrofes.

O Whisper devolve um fluxo contínuo de palavras. Quem canta, no entanto, respira:
as pausas no stem vocal são o sinal mais confiável de onde um verso termina.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from verso_asr.base import Word


@dataclass(slots=True)
class GroupingConfig:
    # Pausa que encerra um verso.
    line_gap_ms: int = 600
    # Pausa longa: um instrumental curto, quase sempre separando estrofes.
    stanza_gap_ms: int = 2000
    # Verso comprido demais não cabe na tela do karaokê.
    max_line_chars: int = 42


@dataclass(slots=True)
class Line:
    idx: int
    text: str
    words: list[Word] = field(default_factory=list)
    start_ms: int | None = None
    end_ms: int | None = None
    starts_stanza: bool = False
    # Timing interpolado em vez de medido: a fase 2 realinha só estas.
    needs_realign: bool = False
    # Um humano já validou esta linha; a confiança do modelo deixa de valer nela.
    reviewed: bool = False
    # Ajuste manual do tempo deste verso, somado ao timing medido.
    nudge_ms: int = 0


def group_into_lines(words: list[Word], config: GroupingConfig | None = None) -> list[Line]:
    """Agrupa palavras em versos, quebrando por pausa ou por comprimento."""
    if not words:
        return []

    cfg = config or GroupingConfig()
    lines: list[Line] = []
    current: list[Word] = []
    stanza_break = True  # a primeira linha sempre abre uma estrofe

    def flush(opens_stanza: bool) -> None:
        if not current:
            return
        lines.append(
            Line(
                idx=len(lines),
                text=" ".join(word.text for word in current),
                words=list(current),
                start_ms=current[0].start_ms,
                end_ms=current[-1].end_ms,
                starts_stanza=opens_stanza,
            )
        )
        current.clear()

    for word in words:
        if not current:
            current.append(word)
            continue

        gap = word.start_ms - current[-1].end_ms
        projected = len(" ".join(w.text for w in current)) + 1 + len(word.text)

        if gap > cfg.stanza_gap_ms:
            flush(stanza_break)
            stanza_break = True
        elif gap > cfg.line_gap_ms or projected > cfg.max_line_chars:
            flush(stanza_break)
            stanza_break = False

        current.append(word)

    flush(stanza_break)
    return lines
