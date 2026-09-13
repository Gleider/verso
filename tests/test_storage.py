"""Storage local e deduplicação por hash."""

import io

from verso_core.storage import LocalStorage, sha256_of


def test_salva_e_recupera_arquivo(tmp_path):
    storage = LocalStorage(tmp_path)

    storage.save("originals/faixa.mp3", io.BytesIO(b"conteudo de audio"))

    assert storage.exists("originals/faixa.mp3")
    assert storage.path_for("originals/faixa.mp3").read_bytes() == b"conteudo de audio"


def test_cria_subdiretorios_sozinho(tmp_path):
    storage = LocalStorage(tmp_path)

    caminho = storage.save("a/b/c/faixa.wav", io.BytesIO(b"x"))

    assert caminho.exists()


def test_hash_identico_para_conteudo_identico():
    assert sha256_of(io.BytesIO(b"mesma musica")) == sha256_of(io.BytesIO(b"mesma musica"))


def test_hash_rebobina_o_stream_para_quem_vai_gravar():
    stream = io.BytesIO(b"conteudo")

    sha256_of(stream)

    # Sem o rewind, o upload gravaria um arquivo vazio.
    assert stream.read() == b"conteudo"


def test_apagar_arquivo_inexistente_nao_quebra(tmp_path):
    LocalStorage(tmp_path).delete("nao/existe.mp3")
