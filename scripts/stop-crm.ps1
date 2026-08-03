[CmdletBinding()]
param()

$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot '.runtime\supervisor.pid'
$taskName = 'Concilion CRM Local'

try {
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  }
} catch {}

if (-not (Test-Path -LiteralPath $pidFile)) {
  Write-Host 'O Concilion CRM nao esta em execucao.'
  exit 0
}

$supervisorPid = [int](Get-Content -LiteralPath $pidFile -Raw).Trim()
try {
  Get-Process -Id $supervisorPid -ErrorAction Stop | Out-Null
  & taskkill.exe /PID $supervisorPid /T /F 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'O Windows nao permitiu encerrar a arvore de processos.' }
  Write-Host 'Concilion CRM encerrado.'
} catch {
  if (-not (Get-Process -Id $supervisorPid -ErrorAction SilentlyContinue)) {
    Write-Host 'O processo do Concilion CRM ja estava encerrado.'
  } else {
    Write-Error $_.Exception.Message
    exit 1
  }
}

if (-not (Get-Process -Id $supervisorPid -ErrorAction SilentlyContinue)) {
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}
