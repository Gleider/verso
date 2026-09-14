"""Aplicação FastAPI.

Casca fina: as rotas traduzem HTTP para os casos de uso de packages/.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from verso_core.config import get_settings

from verso_api.queue import close_pool
from verso_api.routers import jobs, lyrics, tracks, video

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.originals_dir.mkdir(parents=True, exist_ok=True)
    settings.vocals_dir.mkdir(parents=True, exist_ok=True)
    yield
    await close_pool()


app = FastAPI(
    title="Verso",
    description="Transcreve música em letra editável e sincroniza como karaokê.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    # O render de vídeo (worker) serve o bundle do Remotion num servidor local
    # em porta sorteada — a origem do Chromium não é a do Next. Por isso é
    # regex, e não uma lista fixa: sem isto, `useAudioData` falha no render
    # com uma mensagem que parece problema de rede, não de CORS.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tracks.router)
app.include_router(lyrics.router)
app.include_router(jobs.router)
app.include_router(video.router)


@app.get("/health", tags=["sistema"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
