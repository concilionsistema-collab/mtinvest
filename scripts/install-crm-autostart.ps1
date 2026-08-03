[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$supervisorScript = Join-Path $PSScriptRoot 'crm-supervisor.ps1'
$taskName = 'Concilion CRM Local'
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$powerShellExecutable = Join-Path $PSHOME 'powershell.exe'

$action = New-ScheduledTaskAction -Execute $powerShellExecutable -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$supervisorScript`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Mantem o portal, a API e a conexao local do Concilion CRM sempre disponiveis.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host 'Inicializacao automatica do Concilion CRM instalada e iniciada.'
Write-Host "Portal: http://localhost:3000"
