"""Client da API não oficial do Musixmatch (matcher.subtitle.get).

Portado do musixmatch-cli (Python/urllib) para httpx async, seguindo o padrão
do projeto: nenhum detalhe de HTTP, banco ou configuração vive aqui — quem usa
o client injeta credenciais, arquivo de sessão e o `httpx.AsyncClient`.

A API exige cada URL assinada com HMAC-SHA1 (URL + data UTC em YYYYMMDD) e um
`usertoken` obtido em `token.get`, que é limitado a ~2 requisições por minuto —
por isso o token fica em cache em disco e só é renovado quando o servidor pede
(`401` com `hint=renew`).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import urllib.parse
import uuid
from datetime import UTC, datetime
from pathlib import Path
from random import getrandbits

import httpx

from verso_lyrics.grouping import Line
from verso_lyrics.lrc import parse_lrc

API_URL = "https://apic.musixmatch.com/ws/1.1/"
USER_AGENT = "Dalvik/2.1.0 (Linux; U; Android 13; Pixel 6 Build/T3B2.230316.003)"
HEADERS = {"User-Agent": USER_AGENT, "Cookie": "AWSELBCORS=0; AWSELB=0"}


class MusixmatchError(Exception):
    """Falha de comunicação ou resposta inesperada do Musixmatch."""


class MusixmatchNotFound(MusixmatchError):
    """A música não existe no catálogo do Musixmatch."""


class TokenExpired(MusixmatchError):
    """O usertoken atual foi recusado; o próximo passo é pedir um novo."""


def sign_url(url: str, secret: str | bytes, today: str) -> str:
    """Assina a URL com HMAC-SHA1 (url + data em YYYYMMDD).

    A data entra por parâmetro para a função poder ser testada com valor fixo.
    """
    key = secret.encode("utf-8") if isinstance(secret, str) else secret
    sig = hmac.new(key, f"{url}{today}".encode(), hashlib.sha1).digest()
    # A implementação de referência (lib Rust do app deles) embute uma quebra
    # de linha no base64 antes de codificar na URL; sem o "\n" o servidor
    # recusa a assinatura.
    sig_b64 = base64.b64encode(sig).decode("ascii") + "\n"
    sep = "&" if "?" in url else "?"
    query = urllib.parse.urlencode({"signature": sig_b64, "signature_protocol": "sha1"})
    return f"{url}{sep}{query}"


def interpretar_resposta(data: dict) -> dict | None:
    """Extrai message.body e traduz os códigos de erro da API."""
    header = data.get("message", {}).get("header", {})
    status = header.get("status_code", 0)
    hint = header.get("hint", "")

    if status < 400:
        return data["message"].get("body")
    if status == 404:
        raise MusixmatchNotFound("Não encontrado no Musixmatch.")
    if status == 401 and hint == "renew":
        raise TokenExpired()
    raise MusixmatchError(f"Erro {status} do Musixmatch: {hint}")


class MusixmatchClient:
    def __init__(
        self,
        app_id: str,
        secret: str,
        session_file: Path,
        http: httpx.AsyncClient,
    ) -> None:
        self._app_id = app_id
        self._secret = secret
        self._session_file = session_file
        self._http = http

    async def fetch_subtitle(self, title: str, artist: str) -> list[Line]:
        """Busca a legenda sincronizada (formato .lrc) e devolve versos prontos."""
        body = await self._request(
            "matcher.subtitle.get",
            {"q_track": title, "q_artist": artist, "subtitle_format": "lrc"},
        )
        subtitle = body.get("subtitle", {})
        if not subtitle.get("subtitle_body"):
            raise MusixmatchNotFound("Esta música não tem letra sincronizada no Musixmatch.")
        return parse_lrc(subtitle["subtitle_body"])

    async def _request(self, endpoint: str, params: dict | None = None) -> dict | None:
        """GET assinado e autenticado; renova o token uma vez se ele expirou."""
        query = {"app_id": self._app_id, "format": "json"}
        if params:
            query.update(params)
        url = f"{API_URL}{endpoint}?{urllib.parse.urlencode(query)}"
        for force_new in (False, True):
            token = await self._user_token(force_new)
            signed = sign_url(f"{url}&usertoken={token}", self._secret, self._today())
            try:
                return interpretar_resposta(await self._get_json(signed))
            except TokenExpired:
                continue
        raise MusixmatchError("Não foi possível renovar a sessão do Musixmatch.")

    async def _get_json(self, url: str) -> dict:
        try:
            response = await self._http.get(url, headers=HEADERS)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as exc:
            raise MusixmatchError(f"Sem resposta do Musixmatch: {exc}") from exc

    async def _user_token(self, force_new: bool = False) -> str:
        if not force_new and self._session_file.exists():
            try:
                return json.loads(self._session_file.read_text(encoding="utf-8"))["usertoken"]
            except (OSError, ValueError, KeyError):
                pass  # cache corrompido: segue para pedir token novo

        # token.get é limitado a ~2 requisições por minuto; por isso o cache acima.
        now = datetime.now(UTC)
        params = {
            "adv_id": str(uuid.uuid4()),
            "root": "0",
            "sideloaded": "0",
            "app_id": self._app_id,
            "build_number": "2022090901",
            "guid": f"{getrandbits(64):016x}",
            "lang": "en_US",
            "model": "manufacturer/Google brand/Google model/Pixel 6",
            "timestamp": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "format": "json",
        }
        token_url = f"{API_URL}token.get?{urllib.parse.urlencode(params)}"
        assinada = sign_url(token_url, self._secret, self._today())
        body = interpretar_resposta(await self._get_json(assinada))
        token = body["user_token"]

        self._session_file.parent.mkdir(parents=True, exist_ok=True)
        self._session_file.write_text(json.dumps({"usertoken": token}), encoding="utf-8")
        return token

    @staticmethod
    def _today() -> str:
        return datetime.now(UTC).strftime("%Y%m%d")
