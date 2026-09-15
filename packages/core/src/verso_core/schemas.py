"""Schemas da API. São eles que viram o OpenAPI e, daí, os tipos do frontend."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from verso_core.models import JobKind, JobState, LyricsSource, TrackState


class WordTiming(BaseModel):
    """Uma palavra cantada, com onde começa, onde termina e quanta certeza o modelo teve."""

    w: str
    s: int = Field(description="início em milissegundos")
    e: int = Field(description="fim em milissegundos")
    p: float = Field(default=1.0, description="probabilidade de 0 a 1")


class LyricLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    idx: int
    text: str
    start_ms: int | None
    end_ms: int | None
    words: list[WordTiming]
    needs_realign: bool
    starts_stanza: bool
    reviewed: bool
    nudge_ms: int = 0


class LyricLineIn(BaseModel):
    """Um verso como o editor o devolve. Sem timings: o servidor os reaproveita."""

    idx: int
    text: str
    starts_stanza: bool = False
    # O editor pode confirmar uma linha sem alterar o texto ("ouvi, está certo").
    reviewed: bool = False


class LyricsVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    track_id: uuid.UUID
    version_no: int
    source: LyricsSource
    language: str | None
    is_active: bool
    parent_id: uuid.UUID | None
    created_at: datetime
    lines: list[LyricLineOut] = []


class LyricsVersionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version_no: int
    source: LyricsSource
    is_active: bool
    created_at: datetime
    line_count: int = 0


class LyricsUpdate(BaseModel):
    """Salvar correções cria uma versão nova — nunca sobrescreve a anterior."""

    lines: list[LyricLineIn]


class LineNudge(BaseModel):
    """Ajuste manual do tempo de um verso."""

    line_id: uuid.UUID
    nudge_ms: int = Field(ge=-30_000, le=30_000)


class NudgeUpdate(BaseModel):
    nudges: list[LineNudge]


class LyricsImport(BaseModel):
    """Cola uma letra pronta de fora. Uma linha de texto por verso."""

    text: str
    language: str | None = None


class MusixmatchFetch(BaseModel):
    """Busca a letra sincronizada no Musixmatch a partir de título e artista."""

    title: str
    artist: str


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    track_id: uuid.UUID
    kind: JobKind
    state: JobState
    stage: str | None
    progress: float
    error: str | None
    output_key: str | None = None
    params: dict = {}
    created_at: datetime
    finished_at: datetime | None


class TrackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    artist: str | None
    album: str | None
    duration_ms: int | None
    state: TrackState
    lyrics_offset_ms: int = 0
    created_at: datetime


class TrackDetail(TrackOut):
    sha256: str
    size_bytes: int
    mime_type: str
    has_vocals_stem: bool = False
    has_background: bool = False
    active_lyrics: LyricsVersionOut | None = None
    latest_job: JobOut | None = None


class TrackCreated(BaseModel):
    track_id: uuid.UUID
    job_id: uuid.UUID | None
    duplicate: bool = Field(
        default=False, description="true quando o arquivo já existia e foi reaproveitado"
    )


class TrackUpdate(BaseModel):
    title: str | None = None
    artist: str | None = None
    album: str | None = None
    lyrics_offset_ms: int | None = Field(
        default=None,
        ge=-30_000,
        le=30_000,
        description="positivo adianta a letra, negativo atrasa",
    )


class RenderRequest(BaseModel):
    resolution: str = Field(default="1080p", pattern="^(720p|1080p)$")


class TranscribeRequest(BaseModel):
    model: str | None = Field(default=None, description="sobrescreve o modelo padrão")


# ---------------------------------------------------------------------------
# Editor de vídeo integrado (docs/specs/2026-09-14 integrated-video-editor).
#
# Os nomes de campo aqui são camelCase, não o snake_case do resto do arquivo:
# este JSON atravessa a API, o banco (JSONB) e o Chromium do render sem
# nenhuma etapa de renomeação — é consumido direto pelo tipo TypeScript
# `VideoSettings` em `apps/web/composition/settings.ts`. Um desvio de nome
# aqui não dá erro de tipo em lugar nenhum; o campo simplesmente chega como
# `undefined` do lado TS e o vídeo sai com o padrão errado, calado.
# ---------------------------------------------------------------------------


class BackgroundSettings(BaseModel):
    kind: Literal["upload", "library", "cover", "color"] = "color"
    ref: str | None = None
    color: str = "#0c1316"
    ambient: Literal["breathe", "pulse", "drift", "sway", "zoom", "none"] = "breathe"
    ambientIntensity: float = Field(default=0.55, ge=0.0, le=1.0)
    blur: float = Field(default=0.0, ge=0.0, le=40.0)
    darken: float = Field(default=0.35, ge=0.0, le=1.0)
    saturacao: float = Field(default=1.0, ge=0.0, le=3.0)
    contraste: float = Field(default=1.0, ge=0.0, le=3.0)
    brilho: float = Field(default=1.0, ge=0.0, le=3.0)
    matiz: float = Field(default=0.0, ge=-180.0, le=180.0)
    reacaoBatida: float = Field(default=0.5, ge=0.0, le=1.0)


class FontSettings(BaseModel):
    family: Literal[
        "bricolage",
        "source-serif",
        "jetbrains",
        "anton",
        "archivo-black",
        "bebas",
        "playfair",
        "space-grotesk",
        "cascadia",
    ] = "bricolage"
    size: Literal["small", "medium", "large"] = "medium"
    escala: float = Field(default=1.0, ge=0.5, le=2.0)
    weight: int = Field(default=800, ge=100, le=900)
    alignH: Literal["left", "center", "right"] = "center"
    uppercase: bool = False
    lineHeight: float = Field(default=1.2, ge=0.8, le=2.5)
    espacamento: float = Field(default=0.0, ge=-20.0, le=60.0)
    sombra: float = Field(default=0.4, ge=0.0, le=1.0)
    contorno: float = Field(default=0.0, ge=0.0, le=1.0)
    brilho: float = Field(default=0.0, ge=0.0, le=1.0)


class MotionSettings(BaseModel):
    animation: Literal[
        "fill", "fade", "slide", "wipe", "popup", "scaling", "mask", "bubbling", "static"
    ] = "fill"
    tweak: Literal["none", "floating"] = "floating"
    sync: Literal["line", "word", "syllable"] = "line"
    durationMs: int = Field(default=600, ge=0, le=4000)
    intensidade: float = Field(default=0.6, ge=0.0, le=1.0)
    saida: bool = True


class StructureSettings(BaseModel):
    lyricsPosition: Literal["top", "center", "bottom"] = "center"
    #: Quantos versos aparecem de cada lado do atual. Substituiu o antigo
    #: `mostrarVizinhos` (booleano).
    vizinhos: int = Field(default=0, ge=0, le=3)
    opacidadeVizinhos: float = Field(default=0.35, ge=0.0, le=1.0)

    @model_validator(mode="before")
    @classmethod
    def _converter_mostrar_vizinhos(cls, dados: object) -> object:
        """Traz o formato antigo para o novo.

        A conversão precisa acontecer AQUI, e não no `normalizarSettings` do
        TypeScript: o Pydantic descarta campo desconhecido ao validar o JSONB,
        então `mostrarVizinhos` já teria sumido antes de o navegador ver o
        projeto — e o ajuste voltaria ao padrão sem nenhum aviso.
        """
        if not isinstance(dados, dict) or "vizinhos" in dados:
            return dados
        antigo = dados.get("mostrarVizinhos")
        if antigo is None:
            return dados
        return {**dados, "vizinhos": 1 if antigo else 0}


class StyleSettings(BaseModel):
    palette: str = "estudio"
    #: Seleção livre de cor. `None` usa a paleta.
    corCantada: str | None = None
    corPorCantar: str | None = None
    #: Os nove primeiros são os ids históricos; os demais só existiram depois.
    #: Hoje cada um cai em CSS ou em GLSL próprio (`composition/gl/`), conforme
    #: precise ou não amostrar os pixels vizinhos — `architecture.md`.
    texture: Literal[
        "none",
        "grain",
        "vhs",
        "paper",
        "sepia",
        "dust",
        "halftone",
        "vignette",
        "bloom",
        "cromatico",
        "crt",
        "zoomblur",
        "pixelate",
        "thermal",
        "lightleak",
        "emboss",
        "contour",
        "tvoff",
        "monocromatico",
        "glitch",
    ] = "none"
    textureIntensity: float = Field(default=0.5, ge=0.0, le=1.0)
    #: Movimento da intensidade do efeito ao longo do tempo. Espelha
    #: `MovimentoId` de `composition/efeitos/movimento.ts`. Parado por padrão:
    #: ligar sozinho mudaria o visual de todo projeto já salvo.
    movimento: Literal["none", "senoide", "deriva", "batida"] = "none"
    movimentoVelocidade: float = Field(default=0.4, ge=0.0, le=1.0)
    movimentoProfundidade: float = Field(default=0.6, ge=0.0, le=1.0)
    overlay: Literal["none", "scrim-bottom", "scrim-full", "vignette"] = "none"


class VisualizerSettings(BaseModel):
    """Visualizador de áudio. Desenhado em DOM, não em canvas."""

    tipo: Literal["none", "barras", "onda", "circular", "anel"] = "none"
    camada: Literal["atras", "frente"] = "atras"
    posicao: Literal["top", "center", "bottom"] = "bottom"
    tamanho: float = Field(default=0.18, ge=0.02, le=1.0)
    largura: float = Field(default=0.8, ge=0.1, le=1.0)
    opacidade: float = Field(default=0.75, ge=0.0, le=1.0)
    intensidade: float = Field(default=0.7, ge=0.0, le=1.0)
    #: `None` usa a cor de texto cantado da paleta.
    cor: str | None = None
    espelhado: bool = False


class ParticulasSettings(BaseModel):
    """Partículas. Camada própria, que SOMA com a textura em vez de trocá-la."""

    tipo: Literal["none", "poeira", "neve", "fagulhas", "estrelas", "vagalumes"] = "none"
    camada: Literal["atras", "frente"] = "frente"
    quantidade: float = Field(default=0.5, ge=0.0, le=1.0)
    tamanho: float = Field(default=0.5, ge=0.0, le=1.0)
    velocidade: float = Field(default=0.5, ge=0.0, le=1.0)
    opacidade: float = Field(default=0.6, ge=0.0, le=1.0)
    reacaoBatida: float = Field(default=0.4, ge=0.0, le=1.0)
    cor: str | None = None


class OutputSettings(BaseModel):
    aspectRatio: Literal["16:9", "9:16"] = "16:9"
    resolution: Literal["720p", "1080p"] = "1080p"
    fps: int = Field(default=30, ge=1, le=60)


#: Espelha `SETTINGS_VERSION` de `composition/settings.ts`. Sobe quando o
#: formato muda; a leitura continua tolerante (campo que falta vira padrão dos
#: dois lados), então isto é diagnóstico, não porta de migração.
VERSAO_DO_FORMATO = 5


class VideoSettings(BaseModel):
    """Espelha `composition/settings.ts` campo a campo."""

    background: BackgroundSettings = Field(default_factory=BackgroundSettings)
    font: FontSettings = Field(default_factory=FontSettings)
    motion: MotionSettings = Field(default_factory=MotionSettings)
    structure: StructureSettings = Field(default_factory=StructureSettings)
    style: StyleSettings = Field(default_factory=StyleSettings)
    visualizer: VisualizerSettings = Field(default_factory=VisualizerSettings)
    particulas: ParticulasSettings = Field(default_factory=ParticulasSettings)
    output: OutputSettings = Field(default_factory=OutputSettings)


class VideoProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    track_id: uuid.UUID
    template_id: str | None
    settings: VideoSettings
    settings_version: int
    updated_at: datetime


class VideoProjectUpdate(BaseModel):
    """`PUT` com o objeto inteiro, não `PATCH` por campo.

    O editor sempre tem o estado completo em mãos, e gravação parcial
    concorrente não tem quem resolva num app de um usuário só.
    """

    template_id: str | None = None
    settings: VideoSettings
