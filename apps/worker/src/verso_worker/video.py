"""Job de renderização do vídeo de karaokê.

A definição visual do vídeo mora em `apps/web/composition/` (TypeScript,
Remotion) — o mesmo código que desenha o preview no editor. Este módulo é
casca: prepara os versos (`versos.py`, espelhando `composition/versos.ts`),
monta as props, chama `apps/web/renderer/render.mjs` num subprocesso Node, e
traduz o NDJSON que ele emite em progresso no banco.

`packages/video` (Pillow + ffmpeg) foi aposentado nesta etapa — o desenho do
vídeo é só do Remotion agora.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.orm import selectinload
from verso_core.config import get_settings
from verso_core.db import session_scope
from verso_core.models import JobState, LyricsVersion, ProcessingJob, Track, VideoProject
from verso_core.schemas import VideoSettings

from verso_worker.versos import preparar_versos

settings = get_settings()

# Tempo de espera do render antes de desistir. Cobre `delayRender` (30s padrão
# do Remotion) com folga para várias abas do Chromium baixando e decodificando
# o mesmo áudio ao mesmo tempo.
_TIMEOUT_MS = 120_000


class RenderError(RuntimeError):
    pass


async def render_track_video(
    ctx: dict, track_id: str, job_id: str, resolution: str = "1080p"
) -> str:
    """Monta o MP4 da faixa e guarda o caminho no job."""
    track_uuid, job_uuid = uuid.UUID(track_id), uuid.UUID(job_id)

    async with session_scope() as session:
        track = await session.get(Track, track_uuid)
        if track is None:
            return "faixa inexistente"

        version = await session.scalar(
            select(LyricsVersion)
            .where(LyricsVersion.track_id == track_uuid, LyricsVersion.is_active.is_(True))
            .options(selectinload(LyricsVersion.lines))
        )
        if version is None or not version.lines:
            await _fail(job_uuid, "Esta faixa ainda não tem letra para colocar no vídeo.")
            return "sem letra"

        rows = [
            {
                "id": str(line.id),
                "text": line.text,
                "start_ms": line.start_ms,
                "end_ms": line.end_ms,
                "nudge_ms": line.nudge_ms,
                "words": line.words or [],
            }
            for line in version.lines
        ]
        language = version.language or "pt"
        offset_ms = track.lyrics_offset_ms
        duration_ms = track.duration_ms or 0
        has_background = track.background_key is not None

        # O editor de vídeo manda a aparência; sem projeto ainda (faixa nunca
        # aberta no editor), usa os padrões — o schema preenche tudo mesmo a
        # partir de um dict vazio.
        project = await session.scalar(
            select(VideoProject).where(VideoProject.track_id == track_uuid)
        )
        video_settings = VideoSettings.model_validate(
            project.settings if project is not None else {}
        ).model_dump()
        # O botão "gerar 720p/1080p" (POST /render) continua valendo mesmo
        # com um projeto salvo: a resolução do pedido sobrepõe a do projeto,
        # sem mexer no resto da aparência escolhida no editor.
        video_settings["output"]["resolution"] = resolution

        await session.execute(
            update(ProcessingJob)
            .where(ProcessingJob.id == job_uuid)
            .values(
                state=JobState.running,
                stage="preparando o vídeo",
                progress=0.0,
                started_at=datetime.now(UTC),
            )
        )

    if duration_ms <= 0:
        await _fail(job_uuid, "Esta faixa ainda não tem duração medida.")
        raise RenderError("Esta faixa ainda não tem duração medida.")

    output_key = f"renders/{track_id}-{resolution}.mp4"
    output_path = settings.verso_storage_dir / output_key

    try:
        versos = preparar_versos(rows, offset_ms, language)
        if not versos:
            raise RenderError("Nenhum verso tem marcação de tempo para exibir no vídeo.")

        payload = {
            "bundleDir": str(settings.remotion_bundle_dir),
            "compositionId": "karaoke",
            "outputLocation": str(output_path),
            "timeoutInMilliseconds": _TIMEOUT_MS,
            "crf": 20,
            "x264Preset": "medium",
            "inputProps": {
                "settings": video_settings,
                "versos": versos,
                "duracaoMs": duration_ms,
                "audioUrl": f"{settings.internal_api_url}/tracks/{track_id}/audio",
                "backgroundUrl": (
                    f"{settings.internal_api_url}/tracks/{track_id}/background"
                    if has_background
                    else None
                ),
            },
        }

        await _renderizar(job_uuid, payload)
    except Exception as exc:  # noqa: BLE001 - a mensagem precisa chegar à interface
        await _fail(job_uuid, _human_error(exc))
        raise

    async with session_scope() as session:
        await session.execute(
            update(ProcessingJob)
            .where(ProcessingJob.id == job_uuid)
            .values(
                state=JobState.done,
                stage="pronto",
                progress=1.0,
                output_key=output_key,
                finished_at=datetime.now(UTC),
            )
        )

    return output_key


async def _reportar(job_id: uuid.UUID, stage: str, progress: float) -> None:
    """Empurra o estágio atual para o banco; o SSE da API lê daqui."""
    async with session_scope() as session:
        await session.execute(
            update(ProcessingJob)
            .where(ProcessingJob.id == job_id)
            .values(stage=stage, progress=round(progress, 3), state=JobState.running)
        )


async def _drenar(stream: asyncio.StreamReader, saida: list[str]) -> None:
    """Lê stderr até o fim, guardando cada linha para o diagnóstico.

    Precisa rodar em paralelo à leitura do stdout: um cano cheio travaria o
    Node enquanto ainda estivéssemos lendo o outro lado — o mesmo motivo pelo
    qual o ffmpeg de antes escrevia o stderr em arquivo, não em cano.
    """
    async for linha in stream:
        saida.append(linha.decode("utf-8", "replace").rstrip())


async def _renderizar(job_uuid: uuid.UUID, payload: dict) -> None:
    """Roda `renderer/render.mjs` e traduz o NDJSON dele em progresso no banco."""
    try:
        processo = await asyncio.create_subprocess_exec(
            settings.verso_node_bin,
            str(settings.renderer_script),
            cwd=str(settings.web_dir),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            # O padrão do asyncio é 64 KiB por linha; uma mensagem de erro com
            # stack do Node passa disso e viraria LimitOverrunError.
            limit=1024 * 1024,
        )
    except FileNotFoundError as exc:
        raise RenderError(
            "O Node não foi encontrado. Instale o Node 20 ou mais novo para exportar vídeo."
        ) from exc

    assert processo.stdin is not None
    assert processo.stdout is not None
    assert processo.stderr is not None

    processo.stdin.write(json.dumps(payload).encode("utf-8"))
    await processo.stdin.drain()
    processo.stdin.close()

    erros: list[str] = []
    dreno = asyncio.create_task(_drenar(processo.stderr, erros))

    saida: str | None = None
    falha: str | None = None
    etapa = "montando o vídeo"
    ultimo_valor = -1.0
    ultimo_instante = 0.0

    async for linha in processo.stdout:
        try:
            evento = json.loads(linha)
        except json.JSONDecodeError:
            # Linha que não é nossa (log solto do Remotion). Não pode derrubar
            # o render — vai para o diagnóstico e segue.
            erros.append(linha.decode("utf-8", "replace").rstrip())
            continue

        tipo = evento.get("tipo")
        if tipo == "etapa":
            etapa = evento["etapa"]
            await _reportar(job_uuid, etapa, max(ultimo_valor, 0.0))
        elif tipo in ("empacotando", "progresso"):
            fracao = float(evento.get("progresso", 0.0))
            agora = asyncio.get_event_loop().time()
            # "empacotando" ocupa os primeiros 5% da barra; o render, o resto.
            valor = fracao * 0.05 if tipo == "empacotando" else 0.05 + fracao * 0.95
            if valor - ultimo_valor >= 0.01 or agora - ultimo_instante >= 1.0:
                ultimo_valor, ultimo_instante = valor, agora
                await _reportar(job_uuid, etapa, valor)
        elif tipo == "pronto":
            saida = evento["saida"]
        elif tipo == "erro":
            falha = evento["mensagem"]

    await processo.wait()
    await dreno

    if processo.returncode != 0 or saida is None:
        raise RenderError(_erro_do_render(falha, erros, processo.returncode))


async def _fail(job_id: uuid.UUID, message: str) -> None:
    async with session_scope() as session:
        await session.execute(
            update(ProcessingJob)
            .where(ProcessingJob.id == job_id)
            .values(state=JobState.failed, error=message, finished_at=datetime.now(UTC))
        )


def _erro_do_render(falha: str | None, erros: list[str], codigo: int | None) -> str:
    """Traduz a saída crua do renderer numa mensagem que diz o que fazer.

    Dependência faltando é uma exceção diferente de problema com o arquivo —
    exigem ações diferentes de quem lê (`conventions.md`).
    """
    detalhe = "\n".join(erros)

    if "Cannot find module '@remotion/compositor-" in detalhe:
        return "O Remotion não tem o binário desta plataforma. Rode `npm ci` dentro de apps/web."
    if "libnss3" in detalhe or "error while loading shared libraries" in detalhe:
        return (
            "O Chromium do render não tem as bibliotecas do sistema. "
            "Veja infra/Dockerfile.worker."
        )
    if "ECONNREFUSED" in detalhe:
        return (
            "A API precisa estar no ar durante a exportação — "
            "o Chromium busca o áudio e a imagem nela."
        )
    if "delayRender" in detalhe and "was called but not cleared" in detalhe:
        return (
            "O vídeo demorou demais para carregar áudio ou fonte. "
            "Verifique se a API responde em INTERNAL_API_URL."
        )
    if falha:
        return f"A renderização falhou: {falha[:300]}"
    if detalhe:
        return f"A renderização falhou (código {codigo}): {detalhe[-300:]}"
    return f"A renderização falhou com código {codigo}."


def _human_error(exc: Exception) -> str:
    if isinstance(exc, RenderError):
        return str(exc)
    if isinstance(exc, FileNotFoundError):
        return "O Node não foi encontrado. Instale o Node 20 ou mais novo para exportar vídeo."
    return f"A renderização falhou: {type(exc).__name__}: {str(exc)[:200]}"
