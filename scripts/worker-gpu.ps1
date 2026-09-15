<#
.SYNOPSIS
    Sobe o worker do Verso fora do contêiner, renderizando na GPU desta máquina.

.DESCRIPTION
    O render de vídeo é rasterização de shader, e dentro do Docker ela roda em
    SOFTWARE: o contêiner não alcança a GPU, o Chromium cai no SwiftShader
    (backend "swangle") e um quadro de 1080p com textura e partículas custa
    mais de meio segundo. Medido nesta máquina: 1,93 quadros/s — mais de uma
    hora para uma faixa de quatro minutos.

    Com o worker NATIVO, o mesmo Chromium usa "angle", que encosta no D3D11 e
    na GPU de verdade. O resto da pilha (Postgres, Redis, API, web) continua no
    Docker, e o worker nativo grava no MESMO storage/ que os contêineres
    montam — a interface não percebe a troca.

    O valor deste script não são as duas variáveis de ambiente: é conferir
    ANTES o que, se estiver errado, só apareceria minutos depois no meio de um
    render.

.PARAMETER Gl
    Backend de OpenGL do Chromium. "angle" (padrão) usa a GPU. "swangle" é a
    rasterização por software, a mesma do contêiner — serve para comparar os
    dois lado a lado no mesmo hardware, não para uso normal.

.PARAMETER Forcar
    Não pergunta antes de parar o worker do contêiner.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\worker-gpu.ps1
    powershell -ExecutionPolicy Bypass -File scripts\worker-gpu.ps1 -Gl swangle
#>
[CmdletBinding()]
param(
    [ValidateSet("angle", "swangle")]
    [string]$Gl = "angle",
    [switch]$Forcar
)

# "Stop", ao contrário do limpar-disco.ps1: este script é uma sequência de
# verificações, e seguir depois de uma delas falhar é justamente o que ele
# existe para impedir.
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
$compose = @("compose", "-f", "$raiz\infra\docker-compose.yml", "--env-file", "$raiz\.env")

function Escrever($texto) { Write-Host "  $texto" }

function Titulo($texto) {
    Write-Host ""
    Write-Host "== $texto" -ForegroundColor Cyan
}

<#
    Erro que diz o que fazer, não só o que quebrou (conventions.md).
#>
function Parar($problema, $solucao) {
    Write-Host ""
    Write-Host "  $problema" -ForegroundColor Red
    Write-Host "  $solucao" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

<#
    Lê uma chave do .env da raiz.

    O compose e o worker nativo precisam concordar sobre a porta da API: o
    Chromium do render busca áudio e imagem nela, e uma porta trocada vira
    ECONNREFUSED no meio do render, não na largada.
#>
function DoEnv($chave, $padrao) {
    $arquivo = Join-Path $raiz ".env"
    if (-not (Test-Path $arquivo)) { return $padrao }
    # -Encoding utf8 na LEITURA: o PowerShell 5.1 lê UTF-8 sem BOM como ANSI e
    # destrói os acentos (pitfalls.md §30). Aqui só interessam valores ASCII,
    # mas é o hábito que evita o estrago no próximo arquivo.
    $linha = Get-Content $arquivo -Encoding utf8 |
        Where-Object { $_ -match "^\s*$chave\s*=" } |
        Select-Object -Last 1
    if (-not $linha) { return $padrao }
    return ($linha -split "=", 2)[1].Trim()
}

Titulo "Conferindo o que o render precisa"

# --- 1. O ambiente Python ---------------------------------------------------
$arq = Join-Path $raiz ".venv\Scripts\arq.exe"
if (-not (Test-Path $arq)) {
    Parar "O ambiente Python não está instalado (.venv\Scripts\arq.exe não existe)." "Rode:  uv sync"
}
Escrever "ok  ambiente Python"

# --- 2. O Node e o binário do Remotion desta plataforma ---------------------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Parar "O Node não está no PATH." "Instale o Node 20 ou mais novo."
}

# O @remotion/renderer tem um binário POR plataforma em optionalDependencies.
# Se o node_modules veio de outro sistema, o render morre com "Cannot find
# module '@remotion/compositor-...'" — e só minutos depois (pitfalls.md §21).
$compositor = Join-Path $raiz "apps\web\node_modules\@remotion\compositor-win32-x64-msvc"
if (-not (Test-Path $compositor)) {
    Parar "O Remotion não tem o binário do Windows em apps/web/node_modules." "Rode:  cd apps\web; npm ci"
}
Escrever "ok  Node $(node -v) e o compositor do Remotion"

# --- 3. A infra no Docker ---------------------------------------------------
$porta = DoEnv "API_HOST_PORT" "8000"
$api = "http://localhost:$porta"
try {
    Invoke-WebRequest -Uri "$api/health" -UseBasicParsing -TimeoutSec 5 | Out-Null
} catch {
    Parar "A API não responde em $api." "Suba a infra:  docker compose -f infra\docker-compose.yml --env-file .env up -d postgres redis api web"
}
Escrever "ok  API respondendo em $api"

# --- 4. O worker do contêiner não pode estar de pé --------------------------
# Os dois escutam o MESMO Redis: quem pegar o job primeiro leva, e não há como
# escolher qual. Um render que você acha que está na GPU pode estar no
# SwiftShader do contêiner, e o único sintoma é demorar uma hora.
# try/catch, e não "2>$null": no PowerShell 5.1, stderr de executável externo
# vira ErrorRecord, e com $ErrorActionPreference = "Stop" isso DERRUBA o
# script — mesmo quando o docker terminou com código 0.
try {
    $servicos = & docker @compose ps --status running --services
} catch {
    $servicos = @()
}
$rodando = $servicos -contains "worker"
if ($rodando) {
    Write-Host ""
    Write-Host "  O worker do contêiner está rodando." -ForegroundColor Yellow
    Write-Host "  Os dois na mesma fila brigam pelo job, e parar o contêiner MATA o que ele" -ForegroundColor Yellow
    Write-Host "  estiver fazendo agora (um render ou uma transcrição em andamento)." -ForegroundColor Yellow
    if (-not $Forcar) {
        $resposta = Read-Host "  Parar o worker do contêiner? (s/N)"
        if ($resposta -notmatch "^[sS]") {
            Write-Host ""
            Write-Host "  Nada foi alterado." -ForegroundColor Yellow
            Write-Host ""
            exit 1
        }
    }
    & docker @compose stop worker | Out-Null
}
Escrever "ok  worker do contêiner parado"

# --- 5. Aviso: esta venv provavelmente não transcreve -----------------------
# Chamar o arq direto pula o check-ml do Makefile de propósito — render não
# precisa de torch nem de demucs. Mas a fila é uma só: um job de transcrição
# enfileirado nesta janela cai aqui e falha.
#
# find_spec, e não "import demucs": importar de verdade carrega o torch inteiro
# (segundos e centenas de MB) e, quando falta, cospe um traceback no stderr —
# que no PowerShell 5.1 com "Stop" derrubaria o script. Assim não há stderr
# nenhum, e a checagem é instantânea.
$checagem = "import importlib.util, sys; " +
            "sys.exit(0 if all(importlib.util.find_spec(m) for m in ('demucs', 'faster_whisper')) else 1)"
& (Join-Path $raiz ".venv\Scripts\python.exe") -c $checagem
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  Atenção: esta venv não tem demucs/faster-whisper." -ForegroundColor Yellow
    Write-Host "  Render funciona; TRANSCRIÇÃO não. Um upload novo nesta janela vai falhar." -ForegroundColor Yellow
    Write-Host "  Para transcrever, encerre este worker e volte o do contêiner." -ForegroundColor Yellow
}

# --- 6. O ambiente do worker ------------------------------------------------
$env:VERSO_RENDER_GL = $Gl

# Absoluto, e não o ./storage do .env: o webpack do bundle() do Remotion RECUSA
# caminho relativo em output.path, e o render morre em dez segundos no
# empacotamento. No compose isso nunca aparece porque lá o worker recebe
# VERSO_STORAGE_DIR=/data, que já é absoluto.
$env:VERSO_STORAGE_DIR = (Resolve-Path (Join-Path $raiz "storage")).Path

# O Chromium do render busca áudio e imagem na API por esta URL. Dentro do
# compose ela é http://api:8000; aqui fora, a porta publicada no host.
$env:INTERNAL_API_URL = $api

$comentario = if ($Gl -eq "angle") { "(GPU)" } else { "(software — só para comparar)" }

Titulo "Worker nativo"
Escrever "OpenGL   $Gl  $comentario"
Escrever "storage  $($env:VERSO_STORAGE_DIR)"
Escrever "API      $api"
Write-Host ""
Write-Host "  Pronto. Exporte o vídeo pela interface; Ctrl+C aqui para encerrar." -ForegroundColor Green
Write-Host ""

try {
    & $arq verso_worker.main.WorkerSettings
} finally {
    # Sair daqui deixa a pilha SEM worker nenhum, e nada na interface diz isso:
    # o botão de exportar continua respondendo 202 e o job fica na fila para
    # sempre. Por isso o lembrete no caminho de saída, Ctrl+C incluído.
    Write-Host ""
    Write-Host "  O worker nativo encerrou. A pilha está sem worker." -ForegroundColor Yellow
    Write-Host "  Para voltar ao arranjo todo-em-Docker:" -ForegroundColor Yellow
    Write-Host "    docker compose -f infra\docker-compose.yml --env-file .env start worker" -ForegroundColor Yellow
    Write-Host ""
}
