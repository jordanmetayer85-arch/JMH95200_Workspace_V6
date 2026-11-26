param([Parameter(Mandatory=$true)][int]$SessionPid)
$ErrorActionPreference='Stop'
$expectedClaude=Join-Path $PSScriptRoot 'claude-native/package/claude.exe'
$allProcesses=@(Get-CimInstance Win32_Process)
$sessionProcess=$allProcesses | Where-Object ProcessId -EQ $SessionPid | Select-Object -First 1
if(-not $sessionProcess){exit 0}
if($sessionProcess.ExecutablePath -ine $expectedClaude){throw 'Le processus ne correspond pas à l’agent Atelier IA.'}
$descendants=New-Object 'System.Collections.Generic.HashSet[int]'
$null=$descendants.Add($SessionPid)
do {
 $added=$false
 foreach($candidate in $allProcesses){if($descendants.Contains([int]$candidate.ParentProcessId) -and $descendants.Add([int]$candidate.ProcessId)){$added=$true}}
}while($added)
$ownedPythonRoot=(Join-Path $PSScriptRoot 'desktop-control')+'\'
# Only our agent and Python connector. Never stop applications opened by the user or the AI.
$selected=@($allProcesses | Where-Object {
 $descendants.Contains([int]$_.ProcessId) -and ($_.ProcessId -eq $SessionPid -or ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($ownedPythonRoot,[StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($_.ExecutablePath) -ieq 'python.exe'))
} | Sort-Object @{Expression={if($_.Name -ieq 'python.exe'){0}else{1}}})
foreach($candidate in $selected){
 $current=Get-CimInstance Win32_Process -Filter ('ProcessId = '+[int]$candidate.ProcessId)
 if($current -and $current.CreationDate -eq $candidate.CreationDate -and $current.ExecutablePath -ieq $candidate.ExecutablePath){Stop-Process -Id $candidate.ProcessId -Force -ErrorAction Stop}
}
