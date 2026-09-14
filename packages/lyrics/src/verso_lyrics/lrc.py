"""Importar legenda .lrc — timestamp por verso, sem timing de palavra.

O LRC marca só onde cada verso começa. Quem tem timing de palavra é o pipeline
de transcrição; daqui para frente a linha segue com `words=[]` e
`needs_realign=True`, o mesmo estado de uma letra colada à mão — a fase 2 de
alinhamento forçado é quem mede as palavras depois.
"""

from __future__ import annotations

import re

from verso_lyrics.grouping import Line

# [mm:ss.xx] com centésimos ou [mm:ss.xxx] com milissegundos; o separador
# também aparece como ':' em arquivos gerados por outros programas.
_MARCA_TEMPO = re.compile(r"\[(\d+):(\d{1,2})[.:](\d{1,3})\]")

# Pausa entre versos que separa estrofes no karaokê.
_GAP_ESTROFE_MS = 5_000


class LrcError(Exception):
    """Arquivo .lrc inválido ou sem nenhum timestamp."""


def _para_ms(marca: re.Match[str]) -> int:
    minutos, segundos, fracao = (int(grupo) for grupo in marca.groups())
    # Fração curta é casa decimal: "5" = 0,5 s (500 ms), "34" = 0,34 s.
    ms = fracao * 10 ** (3 - len(marca.group(3)))
    return ((minutos * 60) + segundos) * 1000 + ms


def parse_lrc(texto: str) -> list[Line]:
    """Converte o conteúdo de um .lrc em versos ordenados por início.

    Levanta `LrcError` quando nenhuma linha traz timestamp — nesse caso o
    arquivo não é legenda sincronizada e importá-lo calado produziria uma
    letra inteira sem timing.
    """
    inicios: list[tuple[int, str]] = []
    for linha in texto.splitlines():
        marcas = list(_MARCA_TEMPO.finditer(linha))
        if not marcas:
            continue
        verso = _MARCA_TEMPO.sub("", linha).strip()
        if not verso:
            continue
        inicios.extend((_para_ms(marca), verso) for marca in marcas)

    if not inicios:
        raise LrcError("O arquivo .lrc não contém nenhum timestamp [mm:ss.xx].")

    inicios.sort(key=lambda par: par[0])
    linhas: list[Line] = []
    for idx, (inicio, verso) in enumerate(inicios):
        pausa_longa = idx > 0 and inicio - inicios[idx - 1][0] > _GAP_ESTROFE_MS
        linhas.append(
            Line(
                idx=idx,
                text=verso,
                start_ms=inicio,
                # O LRC não mede fim: quem precisa de end_ms é o pipeline ASR.
                end_ms=None,
                starts_stanza=idx == 0 or pausa_longa,
                needs_realign=True,
            )
        )
    return linhas
