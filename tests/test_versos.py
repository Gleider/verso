"""Preparo dos versos para o vídeo exportado.

Espelha `apps/web/composition/__tests__/versos.test.ts`: o vídeo e o preview
do editor precisam desenhar exatamente o mesmo karaokê.
"""

from verso_worker.versos import preparar_versos


def w(text: str, start: int, end: int, prob: float = 1.0) -> dict:
    return {"w": text, "s": start, "e": end, "p": prob}


def linha(**parcial) -> dict:
    base = {
        "id": "a",
        "text": "",
        "start_ms": 0,
        "end_ms": 1000,
        "nudge_ms": 0,
        "words": [],
    }
    base.update(parcial)
    return base


def test_desloca_a_letra_por_nudge_menos_offset_nunca_o_relogio():
    linhas = [
        linha(
            id="a",
            text="casa",
            start_ms=1000,
            end_ms=2000,
            nudge_ms=200,
            words=[w("casa", 1000, 2000)],
        )
    ]

    (verso,) = preparar_versos(linhas, offset_ms=300)

    assert verso["inicioMs"] == 900
    assert verso["fimMs"] == 1900
    assert verso["segmentos"][0]["s"] == 900


def test_descarta_linhas_sem_start_ms():
    linhas = [
        linha(id="sem-timing", start_ms=None, end_ms=None),
        linha(id="com-timing", start_ms=500, end_ms=1500),
    ]

    versos = preparar_versos(linhas, offset_ms=0)

    assert len(versos) == 1
    assert versos[0]["id"] == "com-timing"


def test_ordena_por_inicio_mesmo_fora_de_ordem():
    linhas = [
        linha(id="segunda", start_ms=5000, end_ms=6000),
        linha(id="primeira", start_ms=1000, end_ms=2000),
    ]

    versos = preparar_versos(linhas, offset_ms=0)

    assert [v["id"] for v in versos] == ["primeira", "segunda"]


def test_concatenar_segmentos_de_varias_palavras_reproduz_o_texto_com_espacos():
    linhas = [
        linha(
            id="a",
            text="casa grande",
            start_ms=0,
            end_ms=1000,
            words=[w("casa", 0, 400), w("grande", 500, 1000)],
        )
    ]

    (verso,) = preparar_versos(linhas, offset_ms=0)

    assert "".join(s["texto"] for s in verso["segmentos"]) == "casa grande"
    assert "".join(p["texto"] for p in verso["palavras"]) == "casa grande"


def test_silabifica_cobrindo_a_duracao_medida():
    linhas = [
        linha(id="a", text="cachorro", start_ms=0, end_ms=1000, words=[w("cachorro", 0, 1000)])
    ]

    (verso,) = preparar_versos(linhas, offset_ms=0)

    assert len(verso["segmentos"]) > 1
    assert verso["segmentos"][0]["s"] == 0
    assert verso["segmentos"][-1]["e"] == 1000
    assert "".join(s["texto"] for s in verso["segmentos"]) == "cachorro"


def test_linha_sem_words_nao_tem_segmentos_mas_continua_exibivel():
    linhas = [linha(id="a", text="letra importada", start_ms=0, end_ms=1000)]

    (verso,) = preparar_versos(linhas, offset_ms=0)

    assert verso["segmentos"] == []
    assert verso["texto"] == "letra importada"
