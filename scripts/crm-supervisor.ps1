[CmdletBinding()]
param(
  [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDirectory = Join-Path $projectRoot '.runtime'
$supervisorLog = Join-Path $runtimeDirectory 'supervisor.log'
$pidFile = Join-Path $runtimeDirectory 'supervisor.pid'
$apiEnvFile = Join-Path $projectRoot 'apps\api\.env'
$portalUrl = 'http://localhost:3000'

New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null

function Write-SupervisorLog([string]$message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message"
  Add-Content -LiteralPath $supervisorLog -Value $line -Encoding UTF8
  if ($Host.Name -ne 'Default Host') { Write-Host $line }
}

function Test-LocalPort([int]$port) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync('127.0.0.1', $port)
    return $task.Wait(600) -and $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Wait-LocalPort([int]$port, [int]$seconds = 90) {
  $limit = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $limit) {
    if (Test-LocalPort $port) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Stop-ProcessTree($process) {
  if ($null -eq $process) { return }
  try {
    if (-not $process.HasExited) {
      & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
    }
  } catch {}
}

$createdNew = $false
$mutex = [System.Threading.Mutex]::new($true, 'Local\ConcilionCRM.Supervisor', [ref]$createdNew)
if (-not $createdNew) {
  if ($OpenBrowser) { Start-Process $portalUrl }
  Write-SupervisorLog 'O Concilion CRM ja esta sendo supervisionado.'
  exit 0
}

Set-Content -LiteralPath $pidFile -Value $PID -Encoding ASCII

$databaseLine = Get-Content -LiteralPath $apiEnvFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $databaseLine) { throw 'DATABASE_URL nao encontrada em apps/api/.env.' }

$remoteDatabaseUrl = ($databaseLine -split '=', 2)[1].Trim().Trim('"')
$localDatabaseBuilder = [System.UriBuilder]$remoteDatabaseUrl
$localDatabaseBuilder.Host = '127.0.0.1'
$localDatabaseBuilder.Port = 15432
$localDatabaseBuilder.Query = 'schema=public&sslmode=disable'
$localDatabaseUrl = $localDatabaseBuilder.Uri.AbsoluteUri

$nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
$npmExecutable = (Get-Command npm.cmd -ErrorAction Stop).Source
$tunnelProcess = $null
$apiProcess = $null
$webProcess = $null
$browserOpened = $false

function Start-Tunnel {
  Write-SupervisorLog 'Iniciando conexao segura com o banco...'
  $env:DATABASE_URL = $remoteDatabaseUrl
  try {
    return Start-Process -FilePath $nodeExecutable -ArgumentList @('apps/api/scripts/postgres-tls-proxy.js') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDirectory 'tls-proxy.stdout.log') -RedirectStandardError (Join-Path $runtimeDirectory 'tls-proxy.stderr.log') -PassThru
  } finally {
    $env:DATABASE_URL = $localDatabaseUrl
  }
}

function Start-Api {
  Write-SupervisorLog 'Iniciando API do Concilion CRM...'
  $env:DATABASE_URL = $localDatabaseUrl
  return Start-Process -FilePath $npmExecutable -ArgumentList @('run','start:dev','--workspace=apps/api') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDirectory 'api.stdout.log') -RedirectStandardError (Join-Path $runtimeDirectory 'api.stderr.log') -PassThru
}

function Start-Web {
  Write-SupervisorLog 'Iniciando portal do Concilion CRM...'
  $previousNextDistDir = $env:NEXT_DIST_DIR
  $env:NEXT_DIST_DIR = '.next-dev'
  try {
    return Start-Process -FilePath $npmExecutable -ArgumentList @('run','dev','--workspace=apps/web') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDirectory 'web.stdout.log') -RedirectStandardError (Join-Path $runtimeDirectory 'web.stderr.log') -PassThru
  } finally {
    if ($null -eq $previousNextDistDir) {
      Remove-Item Env:NEXT_DIST_DIR -ErrorAction SilentlyContinue
    } else {
      $env:NEXT_DIST_DIR = $previousNextDistDir
    }
  }
}

Write-SupervisorLog 'Supervisor do Concilion CRM iniciado.'

try {
  while ($true) {
    try {
      $tunnelRestarted = $false
      if (-not (Test-LocalPort 15432)) {
        Stop-ProcessTree $tunnelProcess
        $tunnelProcess = Start-Tunnel
        if (-not (Wait-LocalPort 15432)) { throw 'A conexao segura com o banco nao iniciou.' }
        $tunnelRestarted = $true
        Write-SupervisorLog 'Conexao segura com o banco pronta.'
      }

      if ($tunnelRestarted -and $null -ne $apiProcess) {
        Stop-ProcessTree $apiProcess
        $apiProcess = $null
      }

      if (-not (Test-LocalPort 3001)) {
        Stop-ProcessTree $apiProcess
        $apiProcess = Start-Api
        if (-not (Wait-LocalPort 3001)) { throw 'A API nao iniciou na porta 3001.' }
        Write-SupervisorLog 'API pronta.'
      }

      if (-not (Test-LocalPort 3000)) {
        Stop-ProcessTree $webProcess
        $webProcess = Start-Web
        if (-not (Wait-LocalPort 3000)) { throw 'O portal nao iniciou na porta 3000.' }
        Write-SupervisorLog "Portal pronto em $portalUrl."
      }

      if ($OpenBrowser -and -not $browserOpened) {
        Start-Process $portalUrl
        $browserOpened = $true
      }
    } catch {
      Write-SupervisorLog "Falha temporaria: $($_.Exception.Message) Nova tentativa em 5 segundos."
    }

    Start-Sleep -Seconds 5
  }
} finally {
  Write-SupervisorLog 'Encerrando servicos do Concilion CRM.'
  Stop-ProcessTree $webProcess
  Stop-ProcessTree $apiProcess
  Stop-ProcessTree $tunnelProcess
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
