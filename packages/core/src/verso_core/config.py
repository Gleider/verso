"""Configuração lida do ambiente, com padrões de desenvolvimento local."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://verso:verso@localhost:5432/verso"
    redis_url: str = "redis://localhost:6379/0"

    verso_storage_dir: Path = Path("./storage")
    verso_max_upload_mb: int = 50

    # Qualidade acima de velocidade. distil-large-v3 é ~4x mais rápido se precisar.
    verso_whisper_model: str = "large-v3"
    verso_whisper_compute: str = "int8"
    verso_whisper_device: str = "cpu"

    verso_demucs_model: str = "htdemucs"
    verso_demucs_device: str = "mps"

    verso_low_confidence: float = 0.5
    verso_keep_vocal_stem: bool = True

    # Credenciais da API não oficial do Musixmatch. O segredo é uma constante
    # pública do protocolo (o app oficial a embute); o env existe para o caso de
    # o servidor passar a exigir outro par.
    verso_musixmatch_app_id: str = "android-player-v1.0"
    verso_musixmatch_secret: str = "mNdca@6W7TeEcFn6*3.s97sJ*yPMd"

    @property
    def originals_dir(self) -> Path:
        return self.verso_storage_dir / "originals"

    @property
    def vocals_dir(self) -> Path:
        return self.verso_storage_dir / "vocals"

    @property
    def musixmatch_session_file(self) -> Path:
        # Junto com o storage: o volume do Docker mantém o token entre rebuilds.
        return self.verso_storage_dir / "musixmatch_session.json"

    @property
    def max_upload_bytes(self) -> int:
        return self.verso_max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
