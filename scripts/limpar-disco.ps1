<#
.SYNOPSIS
    Recupera espaço em disco depois de construir as imagens do Verso (Windows + WSL2).

.DESCRIPTION
    Rodar MANUALMENTE, nunca dentro da build. Cada passo é reversível no
    sentido que importa: o que ele apaga é cache, e a próxima build refaz —
    mais devagar, mas refaz. Nada de dado do usuário é tocado (`storage/`
    fica intacto).

    O passo que realmente devolve espaço ao Windows é o -Compactar, e ele é
    separado de propósito: exige Administrador, derruba o Docker Desktop e
    leva minutos. Os prunes liberam espaço DENTRO do disco virtual; sem
    compactar, o `docker_data.vhdx` continua do mesmo tamanho no Explorer.

.PARAMETER Compactar
    Além dos prunes, desliga o Docker e o WSL e compacta o `docker_data.vhdx`.
    Precisa de PowerShell como Administrador.

.PARAMETER Tudo
    Prune agressivo: remove TODAS as imagens sem contêiner rodando, não só as
    pendentes. A próxima build baixa as bases de novo (uns 2 GB).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\limpar-disco.ps1
    powershell -ExecutionPolicy Bypass -File scripts\limpar-disco.ps1 -Compactar
#>
[CmdletBinding()]
param(
    [switch]$Compactar,
    [switch]$Tudo
)

# "Continue", não "Stop": quase tudo aqui é chamada a executável externo
# (docker, uv, npm, diskpart), e no PowerShell 5.1 qualquer linha que eles
# mandem para o stderr — inclusive avisos inofensivos como "No cache found" —
# vira registro de erro. Com "Stop", a limpeza abortava no meio, deixando o
# resto do espaço para trás. O que pode falhar de verdade tem try/catch.
$ErrorActionPreference = "Continue"
$raiz = Split-Path -Parent $PSScriptRoot

function Escrever($texto) { Write-Host "  $texto" }

<#
    Chama um executável externo sem deixar o stderr dele derrubar o script.
    Devolve as últimas linhas da saída, que é o que interessa nos prunes.
#>
function Rodar($exe, [string[]]$argumentos, [int]$ultimas = 2) {
    if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) {
        Escrever "$exe não está no PATH — pulando"
        return
    }
    $saida = & $exe @argumentos 2>&1 | ForEach-Object { "$_" }
    $saida | Select-Object -Last $ultimas | ForEach-Object { Escrever $_ }
}

function EspacoLivreGB {
    [math]::Round((Get-PSDrive C).Free / 1GB, 1)
}

function Titulo($texto) {
    Write-Host ""
    Write-Host "== $texto" -ForegroundColor Cyan
}

function TamanhoGB($caminho) {
    if (-not (Test-Path $caminho)) { return 0 }
    $bytes = (Get-ChildItem $caminho -Recurse -Force -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum
    if ($null -eq $bytes) { return 0 }
    return [math]::Round($bytes / 1GB, 2)
}

function ApagarPasta($caminho, $rotulo) {
    $gb = TamanhoGB $caminho
    if ($gb -le 0) { Escrever "$rotulo — nada a apagar"; return }
    Escrever "$rotulo — $gb GB"
    try {
        Remove-Item $caminho -Recurse -Force -ErrorAction Stop
    } catch {
        Escrever "  não deu para apagar tudo (arquivo em uso): $($_.Exception.Message)"
    }
}

$antes = EspacoLivreGB
Write-Host "Livre em C: antes — $antes GB" -ForegroundColor Yellow

# ---------------------------------------------------------------------------
# 1. Docker. O cache de build é quase sempre o maior vilão: cada `--build`
#    deixa camadas intermediárias que nada referencia.
# ---------------------------------------------------------------------------
Titulo "Docker"
Escrever "cache de build:"
Rodar docker @("builder", "prune", "-af")
Escrever "imagens:"
if ($Tudo) { Rodar docker @("image", "prune", "-af") } else { Rodar docker @("image", "prune", "-f") }
# Volumes NÃO entram: o Postgres do projeto vive num deles.
Escrever "volumes preservados de propósito — o banco local mora num deles"

# ---------------------------------------------------------------------------
# 2. Caches de pacote. Todos são reconstruídos sob demanda.
# ---------------------------------------------------------------------------
Titulo "Caches de pacote"
# O cache do uv chegou a 23 GB nesta máquina: ele guarda cada wheel de
# torch/demucs de cada resolução que já aconteceu.
Escrever "uv:"
Rodar uv @("cache", "clean") 1
Escrever "npm:"
Rodar npm @("cache", "clean", "--force") 1
ApagarPasta "$env:LOCALAPPDATA\pip\cache" "cache do pip"

# ---------------------------------------------------------------------------
# 3. Artefatos do repositório. Nada aqui é fonte.
# ---------------------------------------------------------------------------
Titulo "Artefatos do repositório"
ApagarPasta (Join-Path $raiz "apps\web\.next\cache") "cache do Next"
ApagarPasta (Join-Path $raiz ".ruff_cache") "cache do ruff"
ApagarPasta (Join-Path $raiz ".pytest_cache") "cache do pytest"
Get-ChildItem $raiz -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
Escrever "__pycache__ removidos"
# O bundle do Remotion é cache com impressão digital: apagar só custa um
# empacotamento a mais no próximo render.
ApagarPasta (Join-Path $raiz "storage\remotion-bundle") "bundle do Remotion"
$impressao = Join-Path $raiz "storage\remotion-bundle.sha256"
if (Test-Path $impressao) { Remove-Item $impressao -Force }

$depois = EspacoLivreGB
Write-Host ""
Write-Host "Livre em C: depois dos prunes — $depois GB (+$([math]::Round($depois - $antes, 1)) GB)" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 4. Compactar o disco virtual do WSL.
#
#    Este é o único passo que devolve espaço ao WINDOWS. O VHDX só cresce:
#    apagar 20 GB de imagens deixa 20 GB de buraco dentro dele e zero byte a
#    mais no Explorer.
# ---------------------------------------------------------------------------
$vhdx = "$env:LOCALAPPDATA\Docker\wsl\disk\docker_data.vhdx"

if (-not $Compactar) {
    if (Test-Path $vhdx) {
        $gb = [math]::Round((Get-Item $vhdx).Length / 1GB, 2)
        Write-Host ""
        Write-Host "O docker_data.vhdx está com $gb GB e NÃO encolhe sozinho." -ForegroundColor Yellow
        Write-Host "Para recuperar isso, rode como Administrador:" -ForegroundColor Yellow
        Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\limpar-disco.ps1 -Compactar"
    }
    return
}

Titulo "Compactando o disco virtual"

$admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# A checagem vem ANTES de desligar qualquer coisa: uma tentativa sem elevação
# já deixou o VHDX anexado e travado, e o Docker Desktop passou a subir com
# ERROR_SHARING_VIOLATION até o reboot.
if (-not $admin) {
    Write-Host "Precisa de Administrador. Nada foi desligado." -ForegroundColor Red
    Write-Host "Abra o PowerShell como Administrador e rode de novo com -Compactar." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $vhdx)) {
    Escrever "docker_data.vhdx não encontrado em $vhdx — nada a compactar"
    return
}

# Sem o trim, o compact não acha nada: apagar imagem libera o bloco no ext4
# de dentro da VM, mas ninguém avisa o VHDX. Medido: 58 GB de arquivo com
# 65 MB de dados, e o compact "com êxito" liberou 0,01 GB. Precisa do Docker
# ligado, por isso vem antes de derrubá-lo.
Escrever "fstrim dentro da VM (avisa o VHDX dos blocos livres)"
Rodar docker @("run", "--rm", "--privileged", "--pid=host", "alpine",
    "nsenter", "-t", "1", "-m", "--", "fstrim", "-av") 2

Escrever "encerrando o Docker Desktop"
Get-Process "Docker Desktop" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process "com.docker.backend" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 5

Escrever "wsl --shutdown"
wsl.exe --shutdown
Start-Sleep -Seconds 8

$antesDoVhdx = [math]::Round((Get-Item $vhdx).Length / 1GB, 2)
Escrever "tamanho atual: $antesDoVhdx GB"

$usouOptimize = $false
if (Get-Command Optimize-VHD -ErrorAction SilentlyContinue) {
    # Caminho preferido: o módulo Hyper-V faz tudo e destaca sozinho no fim.
    try {
        Optimize-VHD -Path $vhdx -Mode Full
        $usouOptimize = $true
    } catch {
        Escrever "Optimize-VHD falhou ($($_.Exception.Message)); tentando o diskpart"
    }
}

if (-not $usouOptimize) {
    # O diskpart é o plano B (Windows Home não tem o módulo Hyper-V). O
    # `detach` no fim do script é obrigatório: sem ele o arquivo continua
    # anexado e o Docker Desktop não sobe mais.
    $script = Join-Path $env:TEMP "verso-compactar.txt"
    @(
        "select vdisk file=`"$vhdx`"",
        "attach vdisk readonly",
        "compact vdisk",
        "detach vdisk",
        "exit"
    ) | Set-Content -Path $script -Encoding ascii
    diskpart /s $script | ForEach-Object { Escrever $_ }
    Remove-Item $script -Force -ErrorAction SilentlyContinue
}

$depoisDoVhdx = [math]::Round((Get-Item $vhdx).Length / 1GB, 2)
Escrever "tamanho final: $depoisDoVhdx GB (liberou $([math]::Round($antesDoVhdx - $depoisDoVhdx, 2)) GB)"

Write-Host ""
Write-Host "Livre em C: $(EspacoLivreGB) GB. Abra o Docker Desktop de novo." -ForegroundColor Green
