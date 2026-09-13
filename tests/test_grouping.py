"""Agrupar palavras soltas do ASR em versos e estrofes."""

from verso_lyrics.grouping import GroupingConfig, group_into_lines

from tests.helpers import w


def test_quebra_verso_em_pausa_longa(duas_frases):
    linhas = group_into_lines(duas_frases)

    assert len(linhas) == 2
    assert linhas[0].text == "a cidade acende tarde"
    assert linhas[1].text == "e eu conto os postes"


def test_verso_carrega_inicio_e_fim_das_proprias_palavras(duas_frases):
    linhas = group_into_lines(duas_frases)

    assert linhas[0].start_ms == 1000
    assert linhas[0].end_ms == 2300
    assert linhas[1].start_ms == 3200
    assert linhas[1].end_ms == 4300


def test_pausa_curta_nao_quebra_verso():
    palavras = [w("um", 0, 200), w("dois", 400, 600), w("tres", 700, 900)]

    linhas = group_into_lines(palavras)

    assert len(linhas) == 1
    assert linhas[0].text == "um dois tres"


def test_quebra_por_comprimento_mesmo_sem_pausa():
    # Sem nenhuma pausa: só o limite de caracteres pode quebrar.
    palavras = [w("palavra", i * 100, i * 100 + 90) for i in range(12)]

    linhas = group_into_lines(palavras, GroupingConfig(max_line_chars=30))

    assert len(linhas) > 1
    assert all(len(linha.text) <= 30 for linha in linhas)


def test_pausa_muito_longa_abre_estrofe():
    palavras = [
        w("primeiro", 0, 400),
        w("verso", 400, 800),
        # 3 s de silêncio: instrumental entre estrofes
        w("segundo", 3800, 4200),
        w("verso", 4200, 4600),
    ]

    linhas = group_into_lines(palavras)

    assert len(linhas) == 2
    assert linhas[0].starts_stanza is True  # a primeira sempre abre uma
    assert linhas[1].starts_stanza is True


def test_palavras_preservam_timing_e_confianca(duas_frases):
    linhas = group_into_lines(duas_frases)

    primeira = linhas[0].words[0]
    assert primeira.text == "a"
    assert primeira.start_ms == 1000
    assert primeira.probability == 0.9


def test_lista_vazia_nao_quebra():
    assert group_into_lines([]) == []
