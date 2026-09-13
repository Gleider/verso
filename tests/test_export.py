"""Exportação para .lrc e texto cru."""

from verso_lyrics.export import to_lrc, to_plain_text
from verso_lyrics.grouping import Line

from tests.helpers import w


def _linhas() -> list[Line]:
    return [
        Line(idx=0, text="primeiro verso", words=[w("primeiro", 1500, 2000)],
             start_ms=1500, end_ms=2000, starts_stanza=True),
        Line(idx=1, text="segundo verso", words=[w("segundo", 2500, 3000)],
             start_ms=2500, end_ms=3000),
        Line(idx=2, text="outra estrofe", words=[w("outra", 65_400, 66_000)],
             start_ms=65_400, end_ms=66_000, starts_stanza=True),
    ]


def test_lrc_usa_timestamp_de_cada_verso():
    saida = to_lrc(_linhas())

    assert "[00:01.50]primeiro verso" in saida
    assert "[00:02.50]segundo verso" in saida


def test_lrc_vira_minutos_depois_de_sessenta_segundos():
    saida = to_lrc(_linhas())

    assert "[01:05.40]outra estrofe" in saida


def test_lrc_inclui_cabecalho_quando_ha_metadados():
    saida = to_lrc(_linhas(), title="Faixa de teste", artist="Artista de teste")

    assert saida.startswith("[ti:Faixa de teste]\n[ar:Artista de teste]")


def test_texto_cru_separa_estrofes_com_linha_em_branco():
    saida = to_plain_text(_linhas())

    assert saida == "primeiro verso\nsegundo verso\n\noutra estrofe\n"


def test_lrc_aplica_o_offset_da_faixa():
    # Offset positivo adianta a letra: os timestamps recuam.
    saida = to_lrc(_linhas(), offset_ms=500)

    assert "[00:01.00]primeiro verso" in saida  # 1500 - 500


def test_lrc_com_offset_negativo_atrasa_a_letra():
    saida = to_lrc(_linhas(), offset_ms=-700)

    assert "[00:02.20]primeiro verso" in saida  # 1500 + 700


def test_offset_nunca_produz_timestamp_negativo():
    saida = to_lrc(_linhas(), offset_ms=99_000)

    assert "[00:00.00]primeiro verso" in saida


def test_lrc_soma_o_ajuste_individual_do_verso():
    linhas = _linhas()
    linhas[1].nudge_ms = -300  # este verso entra 300ms antes

    saida = to_lrc(linhas)

    assert "[00:02.20]segundo verso" in saida  # 2500 - 300
    assert "[00:01.50]primeiro verso" in saida  # intocado


def test_ajuste_do_verso_e_offset_global_se_somam():
    linhas = _linhas()
    linhas[0].nudge_ms = -200

    saida = to_lrc(linhas, offset_ms=300)

    assert "[00:01.00]primeiro verso" in saida  # 1500 - 200 - 300
