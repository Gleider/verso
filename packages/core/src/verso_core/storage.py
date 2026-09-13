"""Armazenamento de arquivos.

`StorageBackend` é um Protocol desde o início: trocar o disco local por S3 ou
MinIO na fase 4 é escrever uma classe nova, sem tocar em nenhum caso de uso.
"""

from __future__ import annotations

import hashlib
import shutil
from pathlib import Path
from typing import BinaryIO, Protocol


class StorageBackend(Protocol):
    def save(self, key: str, source: BinaryIO) -> Path: ...
    def path_for(self, key: str) -> Path: ...
    def exists(self, key: str) -> bool: ...
    def delete(self, key: str) -> None: ...


class LocalStorage:
    """Guarda arquivos numa árvore de diretórios sob `root`."""

    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def path_for(self, key: str) -> Path:
        return self.root / key

    def save(self, key: str, source: BinaryIO) -> Path:
        dest = self.path_for(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("wb") as fh:
            shutil.copyfileobj(source, fh)
        return dest

    def exists(self, key: str) -> bool:
        return self.path_for(key).exists()

    def delete(self, key: str) -> None:
        self.path_for(key).unlink(missing_ok=True)


def sha256_of(source: BinaryIO, chunk_size: int = 1024 * 1024) -> str:
    """Hash do conteúdo, usado para deduplicar uploads.

    Consome o stream e o rebobina, para que o chamador possa gravá-lo em seguida.
    """
    digest = hashlib.sha256()
    source.seek(0)
    while chunk := source.read(chunk_size):
        digest.update(chunk)
    source.seek(0)
    return digest.hexdigest()
