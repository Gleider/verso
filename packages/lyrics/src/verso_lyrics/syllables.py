"""Silabificação e distribuição de tempo dentro da palavra.

Porta da mesma lógica usada no player (`apps/web/lib/syllables.ts`), para que o
vídeo exportado tenha exatamente o mesmo karaokê que se vê na tela.

O alvo não é rigor linguístico: é aproximar a duração percebida de cada pedaço
da palavra, porque canto não é uniforme — tônica, ditongo e sílaba travada por
consoante duram mais que uma átona aberta.
"""

from __future__ import annotations

from dataclasses import dataclass

STRONG = "aeoáéóâêôãõà"
WEAK = "iuy"
ACCENTED_STRESS = "áéíóúâêô"  # acento gráfico manda na tonicidade
NASAL_STRESS = "ãõ"  # ditongo nasal final atrai a tônica
VOWELS = STRONG + WEAK + "íúï"

# Consoantes que nunca se separam da vogal seguinte.
ONSET_CLUSTERS = {
    "ch", "lh", "nh", "qu", "gu",
    "bl", "br", "cl", "cr", "dr", "fl", "fr", "gl", "gr",
    "pl", "pr", "tl", "tr", "vl", "vr", "pn", "ps",
}

DEFAULT_WEIGHT = 1.0
DIPHTHONG_BONUS = 0.3
CODA_BONUS = 0.15
STRESS_BONUS = 0.35
FINAL_BONUS = 0.1


@dataclass(slots=True)
class TimedSyllable:
    text: str
    start_ms: int
    end_ms: int


def _is_vowel(char: str) -> bool:
    return char in VOWELS


def _forms_diphthong(first: str, second: str, lang: str) -> bool:
    """Duas vogais na mesma sílaba, ou em sílabas diferentes?"""
    if lang != "pt":
        return True  # em inglês a ortografia não ajuda; agrupamos
    if first in NASAL_STRESS and second in ("e", "o"):
        return True  # ão, ãe, õe
    if first in STRONG and second in STRONG:
        return False  # hiato
    return first in WEAK or second in WEAK


def _has_silent_final_e(word: str, lang: str) -> bool:
    """O 'e' final de 'time' não é núcleo de sílaba."""
    return lang != "pt" and len(word) > 2 and word.endswith("e") and not _is_vowel(word[-2])


def split_syllables(word: str, lang: str = "pt") -> list[str]:
    """Divide a palavra em sílabas; concatenadas, devolvem a palavra original."""
    if not word:
        return []

    lower = word.lower()
    limit = len(lower) - 1 if _has_silent_final_e(lower, lang) else len(lower)

    # 1. Núcleos vocálicos, agrupando ditongos.
    nuclei: list[tuple[int, int]] = []
    index = 0
    while index < limit:
        if not _is_vowel(lower[index]):
            index += 1
            continue
        end = index + 1
        while end < limit and _is_vowel(lower[end]) and _forms_diphthong(
            lower[end - 1], lower[end], lang
        ):
            end += 1
        nuclei.append((index, end))
        index = end

    if len(nuclei) <= 1:
        return [word]

    # 2. Um corte entre cada par de núcleos, conforme as consoantes no meio.
    cuts: list[int] = []
    for position in range(len(nuclei) - 1):
        start = nuclei[position][1]
        stop = nuclei[position + 1][0]

        if stop - start <= 1:
            cuts.append(start)  # hiato, ou consoante que abre a sílaba seguinte
        else:
            last_two = lower[stop - 2 : stop]
            cuts.append(stop - 2 if last_two in ONSET_CLUSTERS else stop - 1)

    out: list[str] = []
    previous = 0
    for cut in cuts:
        if cut > previous:
            out.append(word[previous:cut])
        previous = cut
    out.append(word[previous:])
    return out


def _stress_index(syllables: list[str], lang: str) -> int:
    """Índice da sílaba tônica."""
    if len(syllables) <= 1:
        return 0
    lowered = [s.lower() for s in syllables]

    if lang == "pt":
        for position, syllable in enumerate(lowered):
            if any(char in ACCENTED_STRESS for char in syllable):
                return position
        for position, syllable in enumerate(lowered):
            if any(char in NASAL_STRESS for char in syllable):
                return position

        word = "".join(lowered)
        paroxytone = word.endswith(("a", "e", "o", "as", "es", "os", "am", "em", "ens"))
        return len(syllables) - 2 if paroxytone else len(syllables) - 1

    # Inglês: a primeira sílaba carrega o acento na maioria das palavras curtas.
    return 0


def syllable_weights(syllables: list[str], lang: str = "pt") -> list[float]:
    """Peso de duração de cada sílaba."""
    stress = _stress_index(syllables, lang)
    weights: list[float] = []

    for position, syllable in enumerate(syllables):
        lower = syllable.lower()
        vowels = sum(1 for char in lower if _is_vowel(char))
        last_vowel = max((i for i, c in enumerate(lower) if _is_vowel(c)), default=-1)
        has_coda = 0 <= last_vowel < len(lower) - 1

        weight = DEFAULT_WEIGHT
        if vowels >= 2:
            weight += DIPHTHONG_BONUS
        if has_coda:
            weight += CODA_BONUS
        if position == stress:
            weight += STRESS_BONUS
        if position == len(syllables) - 1:
            weight += FINAL_BONUS
        weights.append(weight)

    return weights


def time_syllables(
    text: str, start_ms: int, end_ms: int, lang: str = "pt"
) -> list[TimedSyllable]:
    """Reparte o intervalo da palavra entre suas sílabas.

    Os segmentos são contíguos por construção: o fim de um é o começo do
    próximo, e o último termina onde a palavra termina — sem buraco onde o
    destaque pudesse sumir.
    """
    syllables = split_syllables(text, lang)
    if not syllables:
        return []
    if len(syllables) == 1:
        return [TimedSyllable(text=text, start_ms=start_ms, end_ms=end_ms)]

    weights = syllable_weights(syllables, lang)
    total = sum(weights)
    duration = max(0, end_ms - start_ms)

    out: list[TimedSyllable] = []
    cursor = start_ms
    for position, syllable in enumerate(syllables):
        is_last = position == len(syllables) - 1
        stop = end_ms if is_last else round(cursor + duration * weights[position] / total)
        out.append(TimedSyllable(text=syllable, start_ms=cursor, end_ms=stop))
        cursor = stop
    return out
