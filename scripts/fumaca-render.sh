#!/bin/sh
# Teste de fumaça do render, para rodar DENTRO do contêiner do worker.
#
#   docker compose -f infra/docker-compose.yml --env-file .env \
#     run --rm --no-deps -T --entrypoint sh worker -s <track-id> [--gl] \
#     < scripts/fumaca-render.sh
#
# Por que existe: o `pitfalls.md` §27 diz que mudança na camada de shaders só
# está pronta depois de um render DENTRO do contêiner — `angle` funciona na
# máquina com GPU e falha aqui, onde não há GPU nenhuma. Rodar uma faixa
# inteira para descobrir isso custa mais de uma hora em rasterização por
# software (~2 quadros/s); este script renderiza 7 segundos.
#
# Também cobre o que uma imagem enxugada pode ter quebrado sem avisar: o venv
# sem `triton` ainda importa torch e demucs, o node_modules reduzido resolve
# tudo que entra no bundle, o Chromium está no lugar e as fontes de `public/`
# existem (sem elas TODA fonte cai no fallback do sistema, calada — §24).
#
# Os cuidados vêm do §32, e cada um já enganou alguém aqui:
#   - apagar a saída ANTES, porque o MP4 da execução anterior passa por novo;
#   - procurar o erro no STDOUT, que é onde o render.mjs o emite (o stderr é
#     do Chromium);
#   - exigir arquivo existente e não vazio;
#   - extrair o quadro em t=4 s, nunca no 0 — em t=0 o pulso é zero, os
#     efeitos animados estão no repouso e não há verso ativo, o que faz
#     qualquer efeito temporal parecer morto.
#
# E o quadro extraído é para ser OLHADO. Três defeitos deste projeto (§7, §12
# e §26) passaram pela suíte inteira e só apareceram assim.
set -e

TRACK="$1"
MODO="${2:---simples}"

if [ -z "$TRACK" ]; then
    echo "uso: ... -s <track-id> [--simples|--gl]"
    echo "  o track-id precisa ser de uma faixa com duração medida;"
    echo "  com --gl, também com imagem de fundo."
    exit 1
fi

if [ "$MODO" = "--gl" ]; then
    NOME=gl
else
    NOME=simples
fi
SAIDA="/data/renders/_fumaca_$NOME.mp4"
QUADRO="/data/renders/_fumaca_$NOME.png"

echo "== 1. O venv sem triton ainda serve ao pipeline"
python - <<'PY'
import importlib, importlib.util, sys

for modulo in ("torch", "demucs.apply", "demucs.pretrained", "faster_whisper"):
    try:
        importlib.import_module(modulo)
    except Exception as erro:
        sys.exit(f"   FALHOU — {modulo} não importa: {erro}")

import torch

sem_triton = importlib.util.find_spec("triton") is None
print(f"   ok  torch {torch.__version__}; triton ausente: {sem_triton}")
PY

echo "== 2. O renderer resolve o que o bundle importa"
cd /app/apps/web
node -e "for (const p of ['@remotion/bundler','@remotion/renderer','@remotion/media-utils','@remotion/fonts','remotion','react','react-dom']) require.resolve(p); console.log('   ok  os 7 pacotes do bundle')"
ls node_modules/.remotion/chrome-headless-shell/*/ >/dev/null 2>&1 \
    && echo "   ok  chromium presente" \
    || { echo "   FALHOU — o Chromium não está em node_modules/.remotion"; exit 1; }

echo "== 3. Monta o job ($MODO)"
python - "$TRACK" "$SAIDA" "$MODO" > /tmp/job.json <<'PY'
import json, sys
from verso_core.config import get_settings
from verso_core.schemas import VideoSettings
from verso_worker.versos import preparar_versos

track, saida, modo = sys.argv[1], sys.argv[2], sys.argv[3]
s = get_settings()

# Texto inventado: letra de verdade nunca entra no repositório (CLAUDE.md).
linhas = [
    {"id": "1", "text": "a chuva molha o telhado", "start_ms": 500, "end_ms": 3200,
     "nudge_ms": 0, "words": []},
    {"id": "2", "text": "o cachorro atravessou a ponte", "start_ms": 3400, "end_ms": 6800,
     "nudge_ms": 0, "words": []},
]

# Parte do schema COMPLETO e só muda campos. Montar o dict na mão é o que
# produz campo undefined -> NaN -> camada que simplesmente não desenha (§33).
cfg = VideoSettings().model_dump()
cfg["output"]["resolution"] = "720p"

if modo == "--gl":
    # Os padrões (fundo em cor sólida, textura "none") não montam canvas
    # nenhum: `precisaDeGl()` é falso e o render não prova nada sobre WebGL.
    # Aqui os DOIS contextos entram — o do fundo e o das partículas.
    cfg["background"]["kind"] = "upload"    # imagem vira textura de GL
    cfg["background"]["ambient"] = "drift"
    cfg["style"]["texture"] = "cromatico"   # efeito que reamostra pixels
    cfg["style"]["textureIntensity"] = 0.9
    cfg["style"]["movimento"] = "senoide"
    cfg["particulas"]["tipo"] = "fagulhas"  # contexto transparente próprio
    cfg["particulas"]["quantidade"] = 0.8
    cfg["particulas"]["opacidade"] = 0.9

print(json.dumps({
    "bundleDir": str(s.remotion_bundle_dir),
    "compositionId": "karaoke",
    "outputLocation": saida,
    "timeoutInMilliseconds": 180000,
    "crf": 20,
    "x264Preset": "medium",
    "inputProps": {
        "settings": cfg,
        "versos": preparar_versos(linhas, 0, "pt"),
        "duracaoMs": 7000,
        "audioUrl": f"{s.internal_api_url}/tracks/{track}/audio",
        "backgroundUrl": f"{s.internal_api_url}/tracks/{track}/background",
    },
}))
PY
echo "   ok  job montado"

echo "== 4. Render"
rm -f "$SAIDA"
node renderer/render.mjs < /tmp/job.json > /tmp/fumaca.ndjson 2> /tmp/fumaca.err || true

if grep -q '"tipo":"erro"' /tmp/fumaca.ndjson; then
    echo "   FALHOU — erro no stdout do render.mjs:"
    grep '"tipo":"erro"' /tmp/fumaca.ndjson
    echo "   --- stderr do Chromium (últimas linhas) ---"
    tail -25 /tmp/fumaca.err
    exit 1
fi
if [ ! -s "$SAIDA" ]; then
    echo "   FALHOU — o MP4 não existe ou está vazio."
    tail -25 /tmp/fumaca.err
    exit 1
fi
echo "   ok  MP4: $(stat -c %s "$SAIDA") bytes"

# "Failed to acquire WebGL2 context" é o sintoma exato do §27, e ele sai no
# stderr do Chromium — o NDJSON não o menciona. O aviso sobre "automatic
# fallback to software WebGL has been deprecated" é esperado e inofensivo.
if grep -qi "Failed to acquire" /tmp/fumaca.err; then
    echo "   FALHOU — contexto WebGL2 não subiu. Confira o gl do render.mjs (§27)."
    grep -i "Failed to acquire" /tmp/fumaca.err | head -3
    exit 1
fi

# §33: dois renders de configurações diferentes com byte count idêntico querem
# dizer que a diferença não chegou ao vídeo.
OUTRO=/data/renders/_fumaca_simples.mp4
if [ "$MODO" = "--gl" ] && [ -s "$OUTRO" ]; then
    A=$(stat -c %s "$OUTRO"); B=$(stat -c %s "$SAIDA")
    echo "   sem shader: $A bytes | com shader: $B bytes"
    [ "$A" = "$B" ] && { echo "   FALHOU — tamanho idêntico: as settings não chegaram."; exit 1; }
fi

echo "== 5. Quadro em t=4 s — extraído para ser OLHADO"
ffmpeg -y -v error -ss 4.0 -i "$SAIDA" -frames:v 1 "$QUADRO"
echo "   ok  $QUADRO ($(stat -c %s "$QUADRO") bytes)"
echo
echo "   Na máquina: storage/renders/_fumaca_$NOME.png"
echo "   Apague os _fumaca_* quando terminar."
