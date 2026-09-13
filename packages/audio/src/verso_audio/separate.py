"""Separação de fontes com Demucs.

O ponto de virada do pipeline. O Whisper foi treinado em fala, não em canto com
banda por cima: entregar a mixagem completa faz ele pular versos, inventar texto
sobre solos e transcrever um refrão repetido uma vez só. Isolar o stem vocal
antes muda a natureza do problema, ao custo de cerca de um minuto por faixa.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


class SeparationError(RuntimeError):
    pass


class SeparationUnavailable(SeparationError):
    """O Demucs não está instalado — diferente de uma faixa que ele não conseguiu separar."""


def separate_vocals(
    source: Path,
    out_dir: Path,
    *,
    model: str = "htdemucs",
    device: str = "cpu",
    keep_other_stems: bool = False,
) -> Path:
    """Extrai o stem vocal e devolve o caminho dele.

    Guardamos apenas a voz: os demais stems somam ~40 MB por faixa e não servem
    a nenhuma fase do produto.
    """
    ensure_available()
    out_dir.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable, "-m", "demucs",
        "-n", model,
        "-d", device,
        "--two-stems", "vocals",
        "-o", str(out_dir),
        str(source),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise SeparationError(
            f"A separação de vocal falhou. Detalhe do Demucs: {result.stderr.strip()[-400:]}"
        )

    produced = list(out_dir.glob(f"{model}/**/vocals.wav"))
    if not produced:
        raise SeparationError("O Demucs terminou sem produzir o stem vocal.")

    vocals = produced[0]
    final = out_dir / f"{source.stem}.vocals.wav"
    shutil.move(str(vocals), final)

    if not keep_other_stems:
        shutil.rmtree(out_dir / model, ignore_errors=True)

    return final


def ensure_available() -> None:
    """Falha cedo e com a instrução certa quando os extras de ML faltam.

    O worker é um processo longo: se os pacotes forem instalados enquanto ele
    roda, o cache de diretórios do importador ainda diz que não existem. Sem
    invalidar esse cache, a única saída seria reiniciar o worker.
    """
    import importlib
    import importlib.util

    importlib.invalidate_caches()

    if importlib.util.find_spec("demucs") is None:
        raise SeparationUnavailable(
            "O Demucs não está instalado. Os extras de ML ficam fora da instalação "
            "padrão porque passam de 2 GB. Rode: uv sync --extra ml"
        )


def device_with_fallback(preferred: str) -> str:
    """Confirma que o device pedido existe; cai para CPU quando não existir."""
    if preferred == "cpu":
        return "cpu"
    try:
        import torch
    except ImportError:
        return "cpu"
    if preferred == "mps" and torch.backends.mps.is_available():
        return "mps"
    if preferred == "cuda" and torch.cuda.is_available():
        return "cuda"
    return "cpu"
