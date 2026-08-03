[CmdletBinding()]
param()

$taskName = 'Concilion CRM Local'
$stopScript = Join-Path $PSScriptRoot 'stop-crm.ps1'

& $stopScript
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

Write-Host 'Inicializacao automatica do Concilion CRM removida.'
