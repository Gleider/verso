"""O schema do editor de vídeo.

Este arquivo existe por uma razão específica: `VideoSettings` é um espelho do
tipo TypeScript `VideoSettings` (`apps/web/composition/settings.ts`), e os dois
precisam concordar campo a campo. Um desvio aqui não dá erro em lugar nenhum —
o campo chega como `undefined` do lado TS e o vídeo sai com o padrão errado,
calado.
"""

from verso_core.schemas import VERSAO_DO_FORMATO, StructureSettings, VideoSettings


def test_padrao_do_schema_bate_com_o_do_typescript():
    # Os padrões abaixo são os de `SETTINGS_PADRAO` em composition/settings.ts.
    s = VideoSettings()
    assert s.motion.sync == "line"
    assert s.motion.tweak == "floating"
    assert s.motion.saida is True
    assert s.structure.vizinhos == 0
    assert s.style.corCantada is None
    assert s.output.aspectRatio == "16:9"


def test_versao_do_formato_acompanha_o_typescript():
    # Se este número mudar de um lado só, o diagnóstico de versão mente.
    assert VERSAO_DO_FORMATO == 3


def test_projeto_antigo_com_mostrar_vizinhos_ligado_vira_uma_linha():
    # O campo antigo era booleano. Sem a conversão, o Pydantic descartaria o
    # desconhecido e o ajuste voltaria a zero sem aviso.
    s = StructureSettings.model_validate({"lyricsPosition": "bottom", "mostrarVizinhos": True})
    assert s.vizinhos == 1
    assert s.lyricsPosition == "bottom"


def test_projeto_antigo_com_mostrar_vizinhos_desligado_vira_zero():
    s = StructureSettings.model_validate({"mostrarVizinhos": False})
    assert s.vizinhos == 0


def test_valor_novo_tem_precedencia_sobre_o_antigo():
    # Um projeto que já foi gravado no formato novo não pode ser rebaixado
    # por um campo antigo que sobrou no JSONB.
    s = StructureSettings.model_validate({"mostrarVizinhos": True, "vizinhos": 3})
    assert s.vizinhos == 3


def test_settings_sem_nada_usa_os_padroes():
    s = VideoSettings.model_validate({})
    assert s.structure.vizinhos == 0
    assert s.style.texture == "none"


def test_textura_de_shader_nova_e_aceita():
    # As texturas que só passaram a existir com os shaders GLSL.
    for textura in ("crt", "zoomblur", "pixelate", "thermal", "lightleak", "tvoff"):
        s = VideoSettings.model_validate({"style": {"texture": textura}})
        assert s.style.texture == textura


def test_cor_livre_sobrevive_a_ida_e_volta():
    bruto = {"style": {"corCantada": "#ff0066", "corPorCantar": "#eeeeee"}}
    s = VideoSettings.model_validate(bruto)
    assert s.style.corCantada == "#ff0066"
    assert s.model_dump()["style"]["corPorCantar"] == "#eeeeee"
