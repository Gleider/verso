"""Normalização com ffmpeg."""

from __future__ import annotations

import subprocess
from pathlib import Path


class ConversionError(RuntimeError):
    pass


def to_asr_wav(source: Path, dest: Path, *, sample_rate: int = 16_000) -> Path:
    """Converte para WAV mono 16 kHz — o formato que Demucs e Whisper esperam."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(source),
            "-ac", "1", "-ar", str(sample_rate), "-vn",
            "-loglevel", "error",
            str(dest),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise ConversionError(
            f"Não foi possível ler o áudio deste arquivo. Detalhe do ffmpeg: "
            f"{result.stderr.strip()[:300]}"
        )
    return dest
