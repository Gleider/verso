"""Transcrição com faster-whisper.

Três ajustes aqui não são preferência, são o que contém alucinação — o modo de
falhar mais comum do Whisper em música. Ver os comentários em `transcribe`.
"""

from __future__ import annotations

from pathlib import Path

from verso_asr.base import ProgressCallback, TranscriptionResult, Word


class TranscriberUnavailable(RuntimeError):
    """O modelo de transcrição não está instalado."""


class FasterWhisperTranscriber:
    """Carrega o modelo uma vez e o reaproveita entre jobs.

    O padrão é `large-v3`: qualidade acima de velocidade. Para pressa,
    `distil-large-v3` é cerca de 4x mais rápido com perda modesta.
    """

    def __init__(
        self,
        model_name: str = "large-v3",
        *,
        device: str = "cpu",
        compute_type: str = "int8",
        low_confidence: float = 0.5,
    ) -> None:
        self.model_name = model_name
        self.device = device
        self.compute_type = compute_type
        self.low_confidence = low_confidence
        self._model = None

    def _load(self):
        if self._model is None:
            try:
                # Mesmo motivo do demucs: o worker pode ter começado antes de o
                # pacote existir, e o importador cacheia a listagem do diretório.
                import importlib

                importlib.invalidate_caches()
                from faster_whisper import WhisperModel
            except ImportError as exc:
                raise TranscriberUnavailable(
                    "O faster-whisper não está instalado. Os extras de ML ficam fora da "
                    "instalação padrão porque passam de 2 GB. Rode: uv sync --extra ml"
                ) from exc

            self._model = WhisperModel(
                self.model_name, device=self.device, compute_type=self.compute_type
            )
        return self._model

    def transcribe(
        self,
        audio_path: Path,
        *,
        language: str | None = None,
        on_progress: ProgressCallback | None = None,
    ) -> TranscriptionResult:
        model = self._load()

        segments, info = model.transcribe(
            str(audio_path),
            language=language,  # None = detecção automática (o acervo é pt + en)
            word_timestamps=True,  # obrigatório: sem isso a fase 2 não existe
            # O modelo nunca vê silêncio nem instrumental puro, que é onde ele inventa texto.
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            # Impede que uma transcrição errada contamine todas as seguintes em loop.
            condition_on_previous_text=False,
            beam_size=5,
        )

        total = info.duration or 0
        words: list[Word] = []

        # O faster-whisper devolve um gerador: o progresso sai de onde ele já chegou.
        for segment in segments:
            for word in segment.words or []:
                text = word.word.strip()
                if not text:
                    continue
                words.append(
                    Word(
                        text=text,
                        start_ms=int(word.start * 1000),
                        end_ms=int(word.end * 1000),
                        probability=float(word.probability),
                    )
                )
            if on_progress and total:
                fraction = min(0.99, segment.end / total)
                on_progress(fraction, "transcrevendo")

        return TranscriptionResult(
            words=words,
            language=info.language,
            model=self.model_name,
        )

    def count_low_confidence(self, result: TranscriptionResult) -> int:
        """Quantas palavras merecem um olhar humano primeiro."""
        return sum(1 for word in result.words if word.probability < self.low_confidence)
