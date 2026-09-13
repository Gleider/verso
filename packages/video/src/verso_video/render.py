"""Montagem do vídeo de karaokê.

O fundo e a codificação ficam com o ffmpeg, que faz isso muito melhor; a camada
de texto vem do Pillow por um cano de quadros crus. O ffmpeg compõe as duas.
"""

from __future__ import annotations

import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from verso_video.frames import LyricsLayer, RenderLine

# Alturas padrão; a largura sai da proporção 16:9.
RESOLUTIONS: dict[str, tuple[int, int]] = {
    "720p": (1280, 720),
    "1080p": (1920, 1080),
}

DEFAULT_FPS = 25


class RenderError(RuntimeError):
    pass


@dataclass(slots=True)
class RenderOptions:
    resolution: str = "1080p"
    # Mesmo catálogo do player: breathe, vhs, pulse, none.
    effect: str = "breathe"
    # 0 = quase imperceptível, 1 = assumidamente estilizado.
    effect_intensity: float = 0.55
    fps: int = DEFAULT_FPS
    # Respiração lenta da imagem, igual à do player.
    ambient_period_s: float = 30.0
    ambient_amplitude: float = 0.06
    crf: int = 20
    preset: str = "medium"

    @property
    def size(self) -> tuple[int, int]:
        if self.resolution not in RESOLUTIONS:
            raise RenderError(
                f"Resolução '{self.resolution}' não é aceita. "
                f"Use uma destas: {', '.join(RESOLUTIONS)}."
            )
        return RESOLUTIONS[self.resolution]


def _zoom_expression(options: RenderOptions) -> str:
    """Respiração contínua da imagem, em função do quadro de saída.

    Mesma curva do player: um cosseno suave, sem sobressalto, com amplitude
    pequena o bastante para dar vida sem virar efeito.
    """
    period_frames = max(1, int(options.ambient_period_s * options.fps))
    amplitude = options.ambient_amplitude
    # Começa levemente ampliado para a borda nunca aparecer.
    return f"1.01+{amplitude}*(1-cos(2*PI*on/{period_frames}))/2"


def _effect_chain(options: RenderOptions, width: int, height: int) -> str:
    """Filtros de vídeo do efeito escolhido, aplicados ao fundo.

    Espelha o que o player faz na tela, com as ferramentas do ffmpeg: onde o
    navegador usa camadas e mistura, aqui usamos filtros equivalentes.
    """
    zoom = (
        f"zoompan=z='{_zoom_expression(options)}':d=1:"
        f"s={width}x{height}:fps={options.fps}"
    )

    if options.effect == "none":
        return f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}"

    if options.effect == "vhs":
        period = max(1, int(options.ambient_period_s * options.fps))
        # Os mesmos pares do player (lib/effects.ts): discreto -> marcante.
        i = min(1.0, max(0.0, options.effect_intensity))
        shift = round(1 + 6 * i)
        saturation = round(1.06 + 0.49 * i, 3)
        contrast = round(1.03 + 0.29 * i, 3)
        scanline_depth = round(0.05 + 0.33 * i, 3)
        grain = round(4 + 26 * i)
        vignette_angle = round(3.5 + 2.0 * i, 2)
        # Ordem importa: primeiro enquadra, depois degrada. Degradar antes faria
        # o recorte ampliar o ruído junto com a imagem.
        return ",".join([
            f"scale={width}:{height}:force_original_aspect_ratio=increase",
            f"crop={width}:{height}",
            # Zoom bem discreto: fita treme, não navega.
            f"zoompan=z='1.02+0.015*(1-cos(2*PI*on/{period}))/2':"
            f"d=1:s={width}x{height}:fps={options.fps}",
            # Trilha de croma degradada: os canais escorregam lateralmente.
            f"rgbashift=rh=-{shift}:bh={shift}",
            # Cor puxada e contraste duro, como cópia de cópia.
            f"eq=saturation={saturation}:contrast={contrast}:brightness={round(0.02 * i, 3)}",
            # Linhas de varredura: escurece uma linha a cada três.
            # As vírgulas escapadas são exigência do ffmpeg: sem a barra, ele
            # entenderia fim do filtro. String crua para o Python não reclamar.
            rf"geq=lum='lum(X,Y)*(1-{scanline_depth}*lt(mod(Y\,3)\,1))':"
            r"cb='cb(X,Y)':cr='cr(X,Y)'",
            f"noise=alls={grain}:allf=t+u",
            f"vignette=PI/{vignette_angle}",
        ])

    if options.effect == "pulse":
        # Sem movimento temporal: enquadra e fica.
        return (
            f"scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height},zoompan=z='1.02':d=1:s={width}x{height}:fps={options.fps}"
        )

    return (
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},{zoom}"
    )


def render_karaoke_video(
    *,
    audio_path: Path,
    background_path: Path | None,
    lines: list[RenderLine],
    output_path: Path,
    duration_ms: int,
    options: RenderOptions | None = None,
    on_progress: Callable[[float], None] | None = None,
) -> Path:
    """Gera o MP4 e devolve o caminho do arquivo."""
    opts = options or RenderOptions()
    width, height = opts.size
    output_path.parent.mkdir(parents=True, exist_ok=True)

    layer = LyricsLayer(lines, width, height)
    band_y = height - layer.height
    total_frames = max(1, int((duration_ms / 1000) * opts.fps))

    background_input = (
        ["-loop", "1", "-framerate", str(opts.fps), "-i", str(background_path)]
        if background_path and background_path.exists()
        # Sem imagem: um fundo liso, na mesma cor do app.
        else ["-f", "lavfi", "-i", f"color=c=0x0C1316:s={width}x{height}:r={opts.fps}"]
    )

    background_chain = f"[0:v]{_effect_chain(opts, width, height)}[bg]"

    command = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        *background_input,
        "-f", "rawvideo",
        "-pixel_format", "rgba",
        "-video_size", f"{width}x{layer.height}",
        "-framerate", str(opts.fps),
        "-i", "pipe:0",
        "-i", str(audio_path),
        "-filter_complex",
        f"{background_chain};[bg][1:v]overlay=0:{band_y}:format=auto[v]",
        "-map", "[v]",
        "-map", "2:a",
        "-c:v", "libx264",
        "-preset", opts.preset,
        "-crf", str(opts.crf),
        "-pix_fmt", "yuv420p",
        "-r", str(opts.fps),
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        "-shortest",
        str(output_path),
    ]

    # stderr fica em arquivo, não em cano: um cano cheio travaria o ffmpeg
    # enquanto ainda estamos escrevendo quadros do outro lado.
    error_log = output_path.with_suffix(".ffmpeg.log")
    step = max(1, total_frames // 100)

    with error_log.open("wb") as log:
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=log)
        assert process.stdin is not None
        try:
            for frame in range(total_frames):
                ms = int(frame * 1000 / opts.fps)
                process.stdin.write(layer.draw(ms))
                if on_progress and frame % step == 0:
                    on_progress(frame / total_frames)
            process.stdin.close()
        except BrokenPipeError:
            process.stdin = None  # o ffmpeg já foi embora
        process.wait()

    detail = error_log.read_text(errors="replace")[-400:].strip()
    error_log.unlink(missing_ok=True)

    if process.returncode != 0:
        raise RenderError(f"A renderização falhou. Detalhe do ffmpeg: {detail}")
    if not output_path.exists():
        raise RenderError("O ffmpeg terminou sem gerar o arquivo de vídeo.")

    if on_progress:
        on_progress(1.0)
    return output_path
