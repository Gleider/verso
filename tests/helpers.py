"""Auxiliares dos testes.

Todo texto de letra usado na suíte é inventado para os testes — nunca uma letra real.
"""

from verso_asr.base import Word


def w(text: str, start_ms: int, end_ms: int, prob: float = 0.9) -> Word:
    return Word(text=text, start_ms=start_ms, end_ms=end_ms, probability=prob)
