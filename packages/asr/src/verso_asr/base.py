"""Contrato de transcrição.

`Transcriber` é um Protocol de propósito: trocar faster-whisper por uma API paga,
ou por WhisperX na fase 2, não deve tocar em nenhum caso de uso.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol


@dataclass(slots=True)
class Word:
    """Uma palavra cantada, com onde começa, onde termina e a certeza do modelo."""

    text: str
    start_ms: int
    end_ms: int
    probability: float = 1.0

    @property
    def duration_ms(self) -> int:
        return max(0, self.end_ms - self.start_ms)


@dataclass(slots=True)
class TranscriptionResult:
    words: list[Word] = field(default_factory=list)
    language: str | None = None
    model: str | None = None


class ProgressCallback(Protocol):
    def __call__(self, fraction: float, stage: str) -> None: ...


class Transcriber(Protocol):
    def transcribe(
        self,
        audio_path: Path,
        *,
        language: str | None = None,
        on_progress: ProgressCallback | None = None,
    ) -> TranscriptionResult: ...
