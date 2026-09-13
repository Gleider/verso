"""Exportar a letra em formatos que outros tocadores entendem."""

from __future__ import annotations

from verso_lyrics.grouping import Line


def _timestamp(ms: int) -> str:
    minutes, rest = divmod(max(0, ms), 60_000)
    seconds, millis = divmod(rest, 1000)
    return f"{minutes:02d}:{seconds:02d}.{millis // 10:02d}"


def to_lrc(
    lines: list[Line],
    *,
    title: str = "",
    artist: str = "",
    offset_ms: int = 0,
) -> str:
    """Formato .lrc: um timestamp por verso, lido por quase todo tocador.

    `offset_ms` é o mesmo ajuste do player: positivo adianta a letra, então o
    timestamp exportado recua. O arquivo sai como você ouviu, não como o
    modelo mediu.
    """
    out: list[str] = []
    if title:
        out.append(f"[ti:{title}]")
    if artist:
        out.append(f"[ar:{artist}]")
    for line in lines:
        stamp = _timestamp((line.start_ms or 0) + line.nudge_ms - offset_ms)
        out.append(f"[{stamp}]{line.text}")
    return "\n".join(out) + "\n"


def to_plain_text(lines: list[Line]) -> str:
    """Letra crua, com linha em branco entre estrofes."""
    out: list[str] = []
    for position, line in enumerate(lines):
        if line.starts_stanza and position > 0:
            out.append("")
        out.append(line.text)
    return "\n".join(out) + "\n"
