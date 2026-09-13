"""Saneamento dos timings de palavra vindos do ASR.

Porta da mesma lógica do player (`apps/web/lib/normalize.ts`), para o vídeo
exportado receber o mesmo tratamento que a tela.

O Whisper não mede o áudio: os tempos vêm dos pesos de atenção do modelo. O
defeito que mais atrapalha o karaokê é a duração inflada — a última palavra de
um trecho absorve o silêncio seguinte, e o destaque arrasta sobre um trecho em
que ninguém está cantando.
"""

from __future__ import annotations

MS_PER_CHAR = 180
BASE_MS = 350
MIN_PLAUSIBLE_MS = 700
MAX_PLAUSIBLE_MS = 2000


def plausible_duration(text: str) -> int:
    """Duração plausível de uma palavra cantada, pelo tamanho dela."""
    estimate = len(text) * MS_PER_CHAR + BASE_MS
    return min(MAX_PLAUSIBLE_MS, max(MIN_PLAUSIBLE_MS, estimate))


def normalize_words(words: list[dict]) -> list[dict]:
    """Devolve os timings em ordem, sem sobreposição e sem duração absurda.

    Silêncio real entre palavras é preservado: a correção é sobre duração, não
    sobre posição.
    """
    if not words:
        return []

    ordered = sorted(words, key=lambda word: int(word["s"]))

    clamped: list[dict] = []
    for word in ordered:
        start = int(word["s"])
        # Fim antes do início é dado corrompido; colapsa em duração zero.
        end = max(start, int(word["e"]))
        limit = plausible_duration(str(word["w"]))
        clamped.append({**word, "s": start, "e": min(end, start + limit)})

    # Uma palavra nunca invade a seguinte: o destaque saltaria para trás.
    for index in range(len(clamped) - 1):
        if clamped[index]["e"] > clamped[index + 1]["s"]:
            clamped[index]["e"] = clamped[index + 1]["s"]

    return clamped
