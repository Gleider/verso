"""Prepara os versos para a composição de vídeo.

Espelha `apps/web/composition/versos.ts:prepararVersos` — a mesma
convenção de deslocamento (desloca a LETRA somando `nudge - offset`, nunca o
relógio) e a mesma silabificação, para o vídeo exportado ficar idêntico ao
preview do editor.

Vive no worker, não em `packages/video` (aposentado nesta etapa): usa direto
`verso_lyrics.normalize` e `verso_lyrics.syllables`, sem passar pelo desenho
Pillow que este projeto substituiu pelo Remotion.
"""

from __future__ import annotations

from verso_lyrics.normalize import normalize_words
from verso_lyrics.syllables import time_syllables


def preparar_versos(rows: list[dict], offset_ms: int, lang: str = "pt") -> list[dict]:
    """Traduz linhas de `lyric_line` para o formato `VersoPreparado` (TS).

    Linhas sem `start_ms` são descartadas — não há como posicioná-las no
    vídeo. Cada palavra (exceto a última da linha) ganha um espaço anexado ao
    fim: concatenar os segmentos de toda a linha precisa reproduzir o texto
    com os espaços no lugar certo — sem isto, sílabas de palavras diferentes
    ficam coladas quando renderizadas por sílaba.
    """
    out: list[dict] = []

    for row in rows:
        if row.get("start_ms") is None:
            continue
        shift = (row.get("nudge_ms") or 0) - offset_ms

        normalizadas = normalize_words(row.get("words") or [])
        total_palavras = len(normalizadas)
        segmentos: list[dict] = []
        palavras: list[dict] = []

        for indice_palavra, word in enumerate(normalizadas):
            s = int(word["s"]) + shift
            e = int(word["e"]) + shift
            espaco = "" if indice_palavra == total_palavras - 1 else " "
            palavras.append({"texto": word["w"] + espaco, "s": s, "e": e})

            silabas = time_syllables(word["w"], s, e, lang)
            total_silabas = len(silabas)
            for indice_silaba, silaba in enumerate(silabas):
                ultima_da_palavra = indice_silaba == total_silabas - 1
                segmentos.append(
                    {
                        "texto": silaba.text + (espaco if ultima_da_palavra else ""),
                        "s": silaba.start_ms,
                        "e": silaba.end_ms,
                    }
                )

        start_ms = int(row["start_ms"]) + shift
        fim_bruto = row["end_ms"] if row.get("end_ms") is not None else row["start_ms"]
        end_ms = int(fim_bruto) + shift

        out.append(
            {
                "id": row.get("id") or str(len(out)),
                "texto": row["text"],
                "inicioMs": start_ms,
                "fimMs": end_ms,
                "segmentos": segmentos,
                "palavras": palavras,
            }
        )

    out.sort(key=lambda verso: verso["inicioMs"])
    return out
