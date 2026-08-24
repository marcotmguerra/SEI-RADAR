param(
  [Parameter(Mandatory = $true)]
  [string]$CaminhoRepositorio
)

$ErrorActionPreference = 'Stop'
$caminhoResolvido = (Resolve-Path -LiteralPath $CaminhoRepositorio).Path
$caminhoNpm = (Get-Command npm.cmd -ErrorAction Stop).Source
$acao = New-ScheduledTaskAction -Execute $caminhoNpm -Argument 'run dev:agent' -WorkingDirectory $caminhoResolvido
$gatilho = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$configuracoes = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName 'CRM-SEI Agent' -Description 'Sincronização local, somente leitura, com o SEI' -Action $acao -Trigger $gatilho -Settings $configuracoes -User $env:USERNAME -Force
