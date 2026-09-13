"""Silabificação do backend.

Espelha os casos de `apps/web/lib/__tests__/syllables.test.ts`: o vídeo
exportado precisa dar o mesmo karaokê que o player mostra na tela.
As palavras aqui são vocabulário comum, escolhido pelos padrões silábicos.
"""

import pytest
from verso_lyrics.syllables import (
    split_syllables,
    syllable_weights,
    time_syllables,
)


@pytest.mark.parametrize(
    ("palavra", "esperado"),
    [
        ("casa", ["ca", "sa"]),
        ("cachorro", ["ca", "chor", "ro"]),
        ("palhaco", ["pa", "lha", "co"]),
        ("pai", ["pai"]),
        ("saudade", ["sau", "da", "de"]),
        ("poeta", ["po", "e", "ta"]),
        ("prato", ["pra", "to"]),
        ("livro", ["li", "vro"]),
        ("transporte", ["trans", "por", "te"]),
        ("coração", ["co", "ra", "ção"]),
        ("pães", ["pães"]),
        ("sol", ["sol"]),
        ("três", ["três"]),
        ("ok", ["ok"]),
    ],
)
def test_divide_conforme_as_regras_do_portugues(palavra, esperado):
    assert split_syllables(palavra, "pt") == esperado


@pytest.mark.parametrize(
    ("palavra", "esperado"),
    [("running", ["run", "ning"]), ("time", ["time"]), ("alone", ["a", "lone"])],
)
def test_divide_ingles_por_nucleos_vocalicos(palavra, esperado):
    assert split_syllables(palavra, "en") == esperado


def test_entradas_degeneradas_nao_quebram():
    assert split_syllables("", "pt") == []
    assert split_syllables("!?", "pt") == ["!?"]


@pytest.mark.parametrize("palavra", ["coração", "transporte", "saudade", "cachorro", "psicologia"])
def test_silabas_reconstroem_a_palavra(palavra):
    assert "".join(split_syllables(palavra, "pt")) == palavra


def test_tonica_pesa_mais_que_atona():
    primeira, segunda = syllable_weights(split_syllables("casa", "pt"), "pt")
    assert primeira > segunda  # "ca-sa" é paroxítona


def test_acento_grafico_define_a_tonica():
    pesos = syllable_weights(split_syllables("coração", "pt"), "pt")
    assert pesos[2] > pesos[0]
    assert pesos[2] > pesos[1]


def test_segmentos_cobrem_o_intervalo_sem_buraco():
    segmentos = time_syllables("transporte", 0, 900, "pt")

    assert segmentos[0].start_ms == 0
    assert segmentos[-1].end_ms == 900
    for anterior, seguinte in zip(segmentos, segmentos[1:], strict=False):
        assert seguinte.start_ms == anterior.end_ms


def test_tonica_recebe_mais_tempo():
    ca, sa = time_syllables("casa", 1000, 1800, "pt")

    assert (ca.end_ms - ca.start_ms) > (sa.end_ms - sa.start_ms)


def test_palavra_de_duracao_zero_nao_quebra():
    segmentos = time_syllables("casa", 700, 700, "pt")

    assert all(s.start_ms == 700 and s.end_ms == 700 for s in segmentos)
