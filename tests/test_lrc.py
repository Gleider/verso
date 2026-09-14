"""Importação de .lrc: timestamp por verso, sem timing de palavra."""

import pytest
from verso_lyrics.lrc import LrcError, parse_lrc

LETRA = """[ti:Canção de Exemplo]
[ar:Artista Inventado]
[00:12.34]vou contar até três
[00:15.00]um passarinho voa
[00:17.505]três casas e um cachorro
[01:05.00]fim da primeira estrofe
[02:10.00]começa outra estrofe
"""


def test_timestamp_em_centesimos():
    linhas = parse_lrc(LETRA)

    assert linhas[0].start_ms == 12_340
    assert linhas[0].text == "vou contar até três"


def test_timestamp_em_milesimos():
    linhas = parse_lrc(LETRA)

    assert linhas[2].start_ms == 17_505


def test_timestamp_vira_minutos():
    linhas = parse_lrc(LETRA)

    assert linhas[3].start_ms == 65_000


def test_tags_de_metadado_sao_ignoradas():
    linhas = parse_lrc(LETRA)

    textos = [linha.text for linha in linhas]
    assert "Canção de Exemplo" not in textos
    assert len(linhas) == 5


def test_linha_sem_timestamp_e_descartada():
    # O destaque depende de ordem crescente de início; verso sem início
    # quebraria a busca binária — melhor perder o verso que perder a ordem.
    linhas = parse_lrc("verso solto sem marca\n[00:05.00]verso marcado\n")

    assert [linha.text for linha in linhas] == ["verso marcado"]


def test_linha_só_com_timestamp_sem_texto_e_descartada():
    linhas = parse_lrc("[00:05.00]\n[00:06.00]com texto\n")

    assert [linha.text for linha in linhas] == ["com texto"]


def test_varios_timestamps_na_mesma_linha_expandem_em_versos_repetidos():
    linhas = parse_lrc("[00:10.00][00:20.00]refrão inventado\n")

    assert len(linhas) == 2
    assert linhas[0].start_ms == 10_000
    assert linhas[1].start_ms == 20_000
    assert all(linha.text == "refrão inventado" for linha in linhas)


def test_linhas_ficam_ordenadas_por_inicio():
    linhas = parse_lrc("[00:30.00]tarde\n[00:10.00]cedo\n")

    assert [linha.start_ms for linha in linhas] == [10_000, 30_000]


def test_sem_timing_de_palavra_e_marcada_para_realinhar():
    linhas = parse_lrc(LETRA)

    assert all(linha.words == [] for linha in linhas)
    assert all(linha.needs_realign for linha in linhas)


def test_lrc_não_mede_fim_do_verso():
    linhas = parse_lrc(LETRA)

    assert all(linha.end_ms is None for linha in linhas)


def test_primeira_linha_abre_estrofe_e_pausa_longa_abre_outra():
    linhas = parse_lrc(LETRA)

    assert linhas[0].starts_stanza is True
    assert [linha.starts_stanza for linha in linhas] == [True, False, False, True, True]


def test_idx_sequencial():
    linhas = parse_lrc(LETRA)

    assert [linha.idx for linha in linhas] == list(range(5))


def test_arquivo_sem_nenhum_timestamp_rejeitado():
    with pytest.raises(LrcError, match="nenhum timestamp"):
        parse_lrc("só texto\nsem nenhuma marca de tempo\n")
