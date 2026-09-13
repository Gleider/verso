"""Saneamento de timings no backend.

Espelha `apps/web/lib/__tests__/normalize.test.ts`: o vídeo exportado precisa
receber o mesmo tratamento que o player dá na tela.
"""

from verso_lyrics.normalize import normalize_words


def w(text: str, start: int, end: int, prob: float = 0.9) -> dict:
    return {"w": text, "s": start, "e": end, "p": prob}


def test_timings_sadios_passam_intactos():
    entrada = [w("um", 0, 300), w("dois", 320, 700), w("tres", 700, 1000)]

    assert normalize_words(entrada) == entrada


def test_corta_duracao_inflada():
    _, ultima = normalize_words([w("canto", 0, 500), w("fim", 500, 4200)])

    assert ultima["e"] - ultima["s"] < 1200
    assert ultima["s"] == 500


def test_respeita_sustentacao_plausivel():
    (palavra,) = normalize_words([w("amor", 0, 1000)])

    assert palavra["e"] == 1000


def test_palavra_longa_ganha_mais_folga():
    (curta,) = normalize_words([w("eu", 0, 9000)])
    (longa,) = normalize_words([w("saudade", 0, 9000)])

    assert (longa["e"] - longa["s"]) > (curta["e"] - curta["s"])


def test_desfaz_sobreposicao():
    primeira, segunda = normalize_words([w("vem", 0, 800), w("ca", 500, 900)])

    assert primeira["e"] <= segunda["s"]


def test_reordena_palavras_fora_de_sequencia():
    saida = normalize_words([w("dois", 500, 800), w("um", 0, 400)])

    assert [item["w"] for item in saida] == ["um", "dois"]


def test_fim_nunca_antes_do_inicio():
    (palavra,) = normalize_words([w("erro", 900, 400)])

    assert palavra["e"] >= palavra["s"]


def test_preserva_silencio_real():
    primeira, segunda = normalize_words([w("fim", 0, 400), w("novo", 2400, 2800)])

    assert primeira["e"] == 400
    assert segunda["s"] == 2400


def test_lista_vazia():
    assert normalize_words([]) == []


def test_preserva_texto_e_confianca():
    (saida,) = normalize_words([w("teste", 0, 9000, 0.42)])

    assert saida["w"] == "teste"
    assert saida["p"] == 0.42
