"""Desenho da camada de texto do vídeo.

Esta build do ffmpeg não traz libass nem drawtext, então o karaokê é desenhado
aqui e entregue ao ffmpeg como quadros crus. O lado bom: o vídeo sai visualmente
idêntico ao player, porque usa a mesma silabificação e as mesmas cores, em vez
de uma aproximação feita por outro motor de legendas.

Só a faixa inferior da tela é desenhada — é onde o texto vive — e ela é composta
sobre o fundo animado pelo ffmpeg. Desenhar a tela inteira a cada quadro seria
três vezes mais trabalho para o mesmo resultado.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont
from verso_lyrics.normalize import normalize_words
from verso_lyrics.syllables import TimedSyllable, time_syllables

# As mesmas cores do player.
SUNG = (232, 163, 61, 255)
UNSUNG = (230, 238, 239, 235)
NEIGHBOUR = (230, 238, 239, 105)

# Candidatas por ordem de preferência; a primeira que existir é usada.
FONT_CANDIDATES = (
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
)


def find_font() -> str | None:
    for candidate in FONT_CANDIDATES:
        if Path(candidate).exists():
            return candidate
    return None


@dataclass(slots=True)
class RenderLine:
    """Um verso pronto para desenhar, com suas sílabas já cronometradas."""

    text: str
    start_ms: int
    end_ms: int
    syllables: list[TimedSyllable] = field(default_factory=list)


def build_lines(
    raw_lines: list[dict],
    lang: str = "pt",
    offset_ms: int = 0,
) -> list[RenderLine]:
    """Traduz as linhas do banco para o formato do renderizador.

    `offset_ms` é o ajuste global da faixa: positivo adianta a letra, então o
    tempo de exibição recua — a mesma convenção do player e do `.lrc`.
    """
    out: list[RenderLine] = []
    for row in raw_lines:
        if row.get("start_ms") is None:
            continue
        nudge = row.get("nudge_ms", 0) or 0
        shift = nudge - offset_ms

        syllables: list[TimedSyllable] = []
        # O mesmo saneamento do player: sem ele o destaque do vídeo arrasta
        # sobre trechos em que ninguém está cantando.
        for word in normalize_words(row.get("words") or []):
            syllables.extend(
                time_syllables(
                    word["w"], int(word["s"]) + shift, int(word["e"]) + shift, lang
                )
            )

        out.append(
            RenderLine(
                text=row["text"],
                start_ms=int(row["start_ms"]) + shift,
                end_ms=int(row["end_ms"] or row["start_ms"]) + shift,
                syllables=syllables,
            )
        )
    out.sort(key=lambda line: line.start_ms)
    return out


def active_index(lines: list[RenderLine], ms: int) -> int:
    """Índice do verso em exibição, ou -1 antes do primeiro."""
    low, high, found = 0, len(lines) - 1, -1
    while low <= high:
        mid = (low + high) // 2
        if lines[mid].start_ms <= ms:
            found = mid
            low = mid + 1
        else:
            high = mid - 1
    return found


class LyricsLayer:
    """Desenha a faixa de texto, quadro a quadro."""

    def __init__(
        self,
        lines: list[RenderLine],
        width: int,
        height: int,
        font_path: str | None = None,
    ) -> None:
        self.lines = lines
        self.width = width
        # Faixa inferior: onde a letra aparece.
        self.height = int(height * 0.42)
        self.margin = int(width * 0.06)
        self.max_text_width = width - self.margin * 2

        path = font_path or find_font()
        self.base_size = max(18, int(height * 0.062))
        self.small_size = int(self.base_size * 0.52)

        if path:
            self.font = ImageFont.truetype(path, self.base_size)
            self.small_font = ImageFont.truetype(path, self.small_size)
            self._path = path
        else:
            # Sem fonte no sistema: o vídeo ainda sai, com tipografia pobre.
            self.font = ImageFont.load_default()
            self.small_font = ImageFont.load_default()
            self._path = None

        self._measure = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
        self._fitted: dict[int, ImageFont.FreeTypeFont] = {}

    def _fit(self, index: int, text: str) -> ImageFont.FreeTypeFont:
        """Encolhe a fonte até o verso caber numa linha só.

        Manter cada verso numa linha é o que permite preencher o karaokê por
        recorte horizontal — e é como o karaokê é lido, de qualquer forma.
        """
        if index in self._fitted:
            return self._fitted[index]

        font = self.font
        if self._path:
            size = self.base_size
            while size > int(self.base_size * 0.55):
                font = ImageFont.truetype(self._path, size)
                if self._measure.textlength(text, font=font) <= self.max_text_width:
                    break
                size -= 2
        self._fitted[index] = font
        return font

    def draw(self, ms: int) -> bytes:
        """Devolve a faixa de texto deste instante, em RGBA cru."""
        image = Image.new("RGBA", (self.width, self.height), (0, 0, 0, 0))
        index = active_index(self.lines, ms)
        if index < 0:
            return image.tobytes()

        draw = ImageDraw.Draw(image)
        current = self.lines[index]
        font = self._fit(index, current.text)

        centre_y = int(self.height * 0.42)
        text_width = self._measure.textlength(current.text, font=font)
        x0 = max(self.margin, (self.width - text_width) / 2)

        # Verso anterior e próximo, apagados, para dar contexto.
        for neighbour, offset_y in ((index - 1, -1), (index + 1, 1)):
            if 0 <= neighbour < len(self.lines):
                text = self.lines[neighbour].text
                nx = max(
                    self.margin,
                    (self.width - self._measure.textlength(text, font=self.small_font)) / 2,
                )
                draw.text(
                    (nx, centre_y + offset_y * int(self.base_size * 1.5)),
                    text,
                    font=self.small_font,
                    fill=NEIGHBOUR,
                    anchor="lm",
                )

        # Verso atual: primeiro inteiro na cor "por cantar".
        draw.text((x0, centre_y), current.text, font=font, fill=UNSUNG, anchor="lm")

        fill_x = self._fill_position(current, ms, x0, font)
        if fill_x > x0:
            # A parte já cantada é a mesma linha pintada de âmbar, recortada no
            # ponto exato onde o canto está.
            sung = Image.new("RGBA", (self.width, self.height), (0, 0, 0, 0))
            ImageDraw.Draw(sung).text(
                (x0, centre_y), current.text, font=font, fill=SUNG, anchor="lm"
            )
            mask = Image.new("L", (self.width, self.height), 0)
            ImageDraw.Draw(mask).rectangle([0, 0, int(fill_x), self.height], fill=255)
            # O recorte precisa ir no canal alfa e ser composto por cima:
            # `paste` substituiria os pixels de destino pelos transparentes da
            # camada âmbar, apagando o verso vizinho já desenhado embaixo.
            sung.putalpha(ImageChops.multiply(sung.getchannel("A"), mask))
            image.alpha_composite(sung)

        return image.tobytes()

    def _fill_position(
        self, line: RenderLine, ms: int, x0: float, font: ImageFont.FreeTypeFont
    ) -> float:
        """Até que ponto horizontal o verso já foi cantado."""
        if not line.syllables:
            return 0.0
        if ms >= line.syllables[-1].end_ms:
            return x0 + self._measure.textlength(line.text, font=font)

        consumed = ""
        for syllable in line.syllables:
            if ms < syllable.start_ms:
                break
            if ms >= syllable.end_ms:
                consumed += syllable.text
                continue

            span = max(1, syllable.end_ms - syllable.start_ms)
            fraction = (ms - syllable.start_ms) / span
            before = self._measure.textlength(consumed, font=font)
            width = self._measure.textlength(syllable.text, font=font)
            return x0 + before + width * fraction

        return x0 + self._measure.textlength(consumed, font=font)
