"""Ler duração e tags do arquivo enviado."""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

from mutagen import File as MutagenFile


@dataclass(slots=True)
class AudioMetadata:
    duration_ms: int | None = None
    title: str | None = None
    artist: str | None = None
    album: str | None = None


def _first(tags, *keys: str) -> str | None:
    for key in keys:
        value = tags.get(key)
        if value:
            item = value[0] if isinstance(value, list) else value
            text = str(item).strip()
            if text:
                return text
    return None


def probe(path: Path) -> AudioMetadata:
    """Extrai metadados das tags; cai no ffprobe quando não houver nenhuma."""
    meta = AudioMetadata()

    try:
        audio = MutagenFile(path, easy=True)
    except Exception:
        audio = None

    if audio is not None:
        if audio.info is not None and getattr(audio.info, "length", None):
            meta.duration_ms = int(audio.info.length * 1000)
        tags = audio.tags or {}
        meta.title = _first(tags, "title", "TIT2")
        meta.artist = _first(tags, "artist", "TPE1")
        meta.album = _first(tags, "album", "TALB")

    if meta.duration_ms is None:
        meta.duration_ms = _ffprobe_duration_ms(path)

    return meta


def _ffprobe_duration_ms(path: Path) -> int | None:
    try:
        raw = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(path)],
            capture_output=True,
            text=True,
            timeout=30,
            check=True,
        ).stdout
        duration = json.loads(raw).get("format", {}).get("duration")
        return int(float(duration) * 1000) if duration else None
    except Exception:
        return None
