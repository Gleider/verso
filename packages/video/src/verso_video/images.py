"""Preparação da imagem de fundo.

A validação é feita pelo conteúdo, não pela extensão: nome de arquivo é palpite
— um `.jpg` pode ser qualquer coisa, e uma foto perfeitamente válida pode chegar
sem extensão nenhuma (copiada da web, exportada por outro programa).

Além de validar, a imagem é normalizada: redimensionada para um teto sensato e
gravada num formato único. Assim o render não precisa lidar com arquivos de 40
megapixels, e o disco não enche com fotos cruas de câmera.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

from PIL import Image, UnidentifiedImageError

# Acima disso não há ganho visível num vídeo 1080p, só custo.
MAX_DIMENSION = 2560
JPEG_QUALITY = 90


class ImageError(ValueError):
    """A imagem não pôde ser lida ou preparada."""


@dataclass(slots=True)
class PreparedImage:
    path: Path
    suffix: str
    width: int
    height: int


def prepare_background(source: BinaryIO, destination_dir: Path, stem: str) -> PreparedImage:
    """Valida, normaliza e grava a imagem de fundo.

    Devolve o arquivo pronto para o player e para o render.
    """
    source.seek(0)
    try:
        image = Image.open(source)
        image.load()
    except UnidentifiedImageError as exc:
        raise ImageError(
            "Não consegui ler este arquivo como imagem. Se for uma foto do iPhone "
            "(.heic), exporte como JPEG antes de enviar."
        ) from exc
    except OSError as exc:
        raise ImageError(f"O arquivo de imagem parece corrompido: {exc}") from exc

    # Fotos trazem orientação nos metadados; sem isto elas aparecem deitadas.
    try:
        from PIL import ImageOps

        image = ImageOps.exif_transpose(image) or image
    except Exception:  # noqa: BLE001 - metadado ruim não deve barrar o upload
        pass

    if max(image.size) > MAX_DIMENSION:
        image.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)

    destination_dir.mkdir(parents=True, exist_ok=True)
    has_alpha = image.mode in ("RGBA", "LA", "P")

    if has_alpha:
        # Transparência só sobrevive em PNG.
        path = destination_dir / f"{stem}.png"
        image.convert("RGBA").save(path, "PNG", optimize=True)
        suffix = ".png"
    else:
        path = destination_dir / f"{stem}.jpg"
        image.convert("RGB").save(path, "JPEG", quality=JPEG_QUALITY, optimize=True)
        suffix = ".jpg"

    return PreparedImage(path=path, suffix=suffix, width=image.width, height=image.height)
