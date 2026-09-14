"""Assinatura de URL e leitura de respostas da API não oficial do Musixmatch."""

import urllib.parse

import pytest
from verso_lyrics.musixmatch import (
    MusixmatchError,
    MusixmatchNotFound,
    TokenExpired,
    interpretar_resposta,
    sign_url,
)

SEGREDO = b"segredo-de-teste-inventado"
DATA_FIXA = "20260914"


def test_assinatura_e_deterministica_para_mesma_data():
    uma = sign_url("https://api.exemplo/ws/1.1/matcher.subtitle.get?a=1", SEGREDO, DATA_FIXA)
    outra = sign_url("https://api.exemplo/ws/1.1/matcher.subtitle.get?a=1", SEGREDO, DATA_FIXA)

    assert uma == outra


def test_assinatura_muda_com_a_data():
    uma = sign_url("https://api.exemplo/ws", SEGREDO, "20260914")
    outra = sign_url("https://api.exemplo/ws", SEGREDO, "20260915")

    assert uma != outra


def test_url_ganha_signature_e_protocolo():
    url = sign_url("https://api.exemplo/ws/1.1/x?app_id=app", SEGREDO, DATA_FIXA)
    params = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)

    assert params["signature_protocol"] == ["sha1"]
    assert len(params["signature"]) == 1


def test_quebra_de_linha_do_base64_e_preservada_na_url():
    # A implementação de referência (lib Rust do app) assina com um "\n"
    # embutido no base64; sem ele o servidor recusa a assinatura.
    url = sign_url("https://api.exemplo/ws/1.1/x", SEGREDO, DATA_FIXA)
    params = urllib.parse.parse_qs(urllib.parse.urlparse(url).query, keep_blank_values=True)

    assert params["signature"][0].endswith("\n")


def test_assinatura_usa_e_comercial_quando_url_ja_tem_query():
    url = sign_url("https://api.exemplo/ws?a=1", SEGREDO, DATA_FIXA)

    assert "a=1&signature=" in url


def test_status_menor_que_400_devolve_body():
    resposta = {"message": {"header": {"status_code": 200}, "body": {"subtitle": {}}}}

    assert interpretar_resposta(resposta) == {"subtitle": {}}


def test_status_404_levanta_nao_encontrado():
    with pytest.raises(MusixmatchNotFound):
        interpretar_resposta({"message": {"header": {"status_code": 404}}})


def test_401_com_hint_renew_levanta_token_expirado():
    with pytest.raises(TokenExpired):
        interpretar_resposta({"message": {"header": {"status_code": 401, "hint": "renew"}}})


def test_demais_status_levantam_erro_generico():
    with pytest.raises(MusixmatchError, match="502"):
        interpretar_resposta({"message": {"header": {"status_code": 502, "hint": "over"}}})
