"""Preservar timings quando o usuário corrige a letra.

É deste comportamento que a fase 2 depende: uma correção de ortografia não pode
destruir os timestamps das palavras que não mudaram.
"""

from verso_lyrics.grouping import Line
from verso_lyrics.timing import reconcile_timings

from tests.helpers import w


def linha(texto: str, palavras, idx: int = 0) -> Line:
    return Line(
        idx=idx,
        text=texto,
        words=palavras,
        start_ms=palavras[0].start_ms if palavras else None,
        end_ms=palavras[-1].end_ms if palavras else None,
        starts_stanza=idx == 0,
    )


def test_texto_identico_preserva_todos_os_timings():
    antiga = [linha("a noite cai devagar", [w("a", 0, 100), w("noite", 100, 500),
                                            w("cai", 500, 800), w("devagar", 800, 1400)])]

    nova = reconcile_timings(antiga, ["a noite cai devagar"])

    assert [p.start_ms for p in nova[0].words] == [0, 100, 500, 800]
    assert nova[0].needs_realign is False


def test_corrigir_uma_palavra_preserva_as_vizinhas():
    antiga = [linha("a noute cai devagar", [w("a", 0, 100), w("noute", 100, 500),
                                            w("cai", 500, 800), w("devagar", 800, 1400)])]

    nova = reconcile_timings(antiga, ["a noite cai devagar"])

    palavras = nova[0].words
    assert palavras[0].start_ms == 0        # "a" intacta
    assert palavras[2].start_ms == 500      # "cai" intacta
    assert palavras[3].start_ms == 800      # "devagar" intacta
    # A palavra corrigida cai entre as vizinhas, não em zero.
    assert 100 <= palavras[1].start_ms <= 500


def test_palavra_corrigida_marca_a_linha_para_realinhamento():
    antiga = [linha("um dois tres", [w("um", 0, 200), w("dois", 200, 400), w("tres", 400, 600)])]

    nova = reconcile_timings(antiga, ["um DOIS_NOVO tres"])

    assert nova[0].needs_realign is True


def test_palavra_inserida_recebe_timing_interpolado():
    antiga = [linha("sempre volto", [w("sempre", 1000, 1500), w("volto", 1500, 2000)])]

    nova = reconcile_timings(antiga, ["sempre eu volto"])

    palavras = nova[0].words
    assert len(palavras) == 3
    assert palavras[0].start_ms == 1000
    assert palavras[2].end_ms == 2000
    # A palavra inserida fica entre as duas, em ordem crescente.
    assert palavras[0].end_ms <= palavras[1].start_ms
    assert palavras[1].end_ms <= palavras[2].start_ms


def test_palavra_removida_some_sem_afetar_o_resto():
    antiga = [linha("eu sempre volto aqui", [w("eu", 0, 200), w("sempre", 200, 600),
                                             w("volto", 600, 1000), w("aqui", 1000, 1400)])]

    nova = reconcile_timings(antiga, ["eu volto aqui"])

    palavras = nova[0].words
    assert [p.text for p in palavras] == ["eu", "volto", "aqui"]
    assert palavras[1].start_ms == 600   # "volto" manteve o seu
    assert palavras[2].start_ms == 1000  # "aqui" manteve o seu
    assert nova[0].needs_realign is False  # só remoção não exige realinhar


def test_pontuacao_e_caixa_nao_contam_como_edicao():
    antiga = [linha("vem comigo", [w("vem", 0, 300), w("comigo", 300, 900)])]

    nova = reconcile_timings(antiga, ["Vem, comigo!"])

    assert nova[0].needs_realign is False
    assert nova[0].words[0].start_ms == 0
    assert nova[0].words[1].end_ms == 900
    # O texto salvo é o que o usuário escreveu, com a pontuação dele.
    assert nova[0].text == "Vem, comigo!"


def test_dividir_um_verso_em_dois_distribui_as_palavras():
    antiga = [linha("a chuva bate na janela", [w("a", 0, 100), w("chuva", 100, 500),
                                               w("bate", 500, 800), w("na", 800, 900),
                                               w("janela", 900, 1500)])]

    nova = reconcile_timings(antiga, ["a chuva bate", "na janela"])

    assert len(nova) == 2
    assert [p.text for p in nova[0].words] == ["a", "chuva", "bate"]
    assert [p.text for p in nova[1].words] == ["na", "janela"]
    assert nova[0].start_ms == 0
    assert nova[1].start_ms == 800
    assert nova[1].end_ms == 1500


def test_verso_totalmente_novo_no_fim_nao_quebra():
    antiga = [linha("unico verso", [w("unico", 0, 400), w("verso", 400, 900)])]

    nova = reconcile_timings(antiga, ["unico verso", "verso inventado agora"])

    assert len(nova) == 2
    assert nova[1].needs_realign is True
    # Sem timing conhecido à frente, o verso novo se ancora no fim do anterior.
    assert nova[1].start_ms is not None
    assert nova[1].start_ms >= 900


def test_linha_em_branco_vira_separador_de_estrofe():
    antiga = [linha("primeiro", [w("primeiro", 0, 500)])]

    nova = reconcile_timings(antiga, ["primeiro", "", "segundo"])

    # A linha vazia não vira verso; ela marca o próximo como início de estrofe.
    assert [linha_.text for linha_ in nova] == ["primeiro", "segundo"]
    assert nova[1].starts_stanza is True


def test_substituir_a_letra_inteira_nao_explode():
    antiga = [linha("velho", [w("velho", 0, 500)])]

    nova = reconcile_timings(antiga, ["nada", "a", "ver"])

    assert len(nova) == 3
    assert all(linha_.needs_realign for linha_ in nova)


# --- Revisão humana --------------------------------------------------------
# A confiança do modelo vale até um humano olhar. Depois disso, quem manda é ele.


def test_linha_editada_fica_marcada_como_revisada():
    antiga = [linha("a noute cai", [w("a", 0, 100), w("noute", 100, 500, 0.3),
                                    w("cai", 500, 800)])]

    nova = reconcile_timings(antiga, ["a noite cai"])

    assert nova[0].reviewed is True


def test_linha_intocada_nao_e_marcada_como_revisada():
    antiga = [
        linha("primeiro verso", [w("primeiro", 0, 400, 0.3), w("verso", 400, 900)], idx=0),
        linha("segundo verso", [w("segundo", 1000, 1400), w("verso", 1400, 1900)], idx=1),
    ]

    nova = reconcile_timings(antiga, ["primeiro verso", "segundo TROCADO"])

    assert nova[0].reviewed is False  # ninguém mexeu nela
    assert nova[1].reviewed is True


def test_revisao_sobrevive_a_um_salvamento_seguinte():
    antiga = [linha("ja revisada", [w("ja", 0, 200), w("revisada", 200, 800)])]
    antiga[0].reviewed = True

    nova = reconcile_timings(antiga, ["ja revisada"])

    assert nova[0].reviewed is True


def test_remover_palavra_tambem_conta_como_revisao():
    antiga = [linha("eu sempre volto", [w("eu", 0, 200), w("sempre", 200, 600, 0.2),
                                        w("volto", 600, 1000)])]

    nova = reconcile_timings(antiga, ["eu volto"])

    assert nova[0].reviewed is True


def test_editor_pode_confirmar_linha_sem_alterar_o_texto():
    """O caso 'ouvi, está certo': valida sem digitar nada."""
    antiga = [linha("esta certo", [w("esta", 0, 300, 0.2), w("certo", 300, 900, 0.3)])]

    nova = reconcile_timings(antiga, ["esta certo"], reviewed_flags=[True])

    assert nova[0].reviewed is True


def test_pontuacao_sozinha_nao_marca_como_revisada():
    antiga = [linha("vem comigo", [w("vem", 0, 300), w("comigo", 300, 900)])]

    nova = reconcile_timings(antiga, ["Vem, comigo!"])

    assert nova[0].reviewed is False


# --- Ajuste manual de tempo ------------------------------------------------
# O nudge é um ajuste de apresentação; editar o texto não pode descartá-lo.


def test_ajuste_manual_sobrevive_a_uma_edicao_de_texto():
    antiga = [linha("um dois tres", [w("um", 0, 200), w("dois", 200, 400), w("tres", 400, 600)])]
    antiga[0].nudge_ms = -250

    nova = reconcile_timings(antiga, ["um dois quatro"])

    assert nova[0].nudge_ms == -250


def test_verso_novo_nasce_sem_ajuste():
    antiga = [linha("unico", [w("unico", 0, 500)])]
    antiga[0].nudge_ms = 400

    nova = reconcile_timings(antiga, ["unico", "verso acrescentado"])

    assert nova[0].nudge_ms == 400
    assert nova[1].nudge_ms == 0
