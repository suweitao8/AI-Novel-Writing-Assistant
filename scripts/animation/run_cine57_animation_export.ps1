param(
  [string]$UnrealEditor = "D:/Epic Games/UE_5.7/Engine/Binaries/Win64/UnrealEditor-Cmd.exe",
  [string]$Project = "D:/UnrealWorkspace/Cine57/Cine57.uproject",
  [string]$Script = "D:/Github/AI-Novel-Writing-Assistant-animation-catalog-taxonomy/scripts/animation/export_cine57_animation_catalog.py",
[string]$LogPath = "D:/UnrealWorkspace/Cine57-exported/animation_catalog_export.log"
)

$ErrorActionPreference = "Stop"
$consoleLogPath = "$LogPath.console.log"
$projectPath = (Resolve-Path -LiteralPath $Project).Path
$backupPath = "$projectPath.animscan.bak"
$originalHash = (Get-FileHash -LiteralPath $projectPath -Algorithm SHA256).Hash

$sameProjectProcesses = Get-CimInstance Win32_Process -Filter "Name='UnrealEditor-Cmd.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine.Contains($projectPath) }
if ($sameProjectProcesses) {
  $ids = ($sameProjectProcesses | ForEach-Object ProcessId) -join ", "
  throw "Cine57 is already in use by UnrealEditor-Cmd.exe PID $ids; wait for that process to exit before exporting."
}

if (Test-Path -LiteralPath $backupPath) {
  $backupHash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash
  if ($backupHash -ne $originalHash) {
    throw "Existing project backup hash does not match the current project: $backupPath"
  }
} else {
  Copy-Item -LiteralPath $projectPath -Destination $backupPath -Force
  if (-not (Test-Path -LiteralPath $backupPath)) {
    throw "Could not create verified project backup: $backupPath"
  }
  $backupHash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash
  if ($backupHash -ne $originalHash) {
    throw "Project backup verification failed: $backupPath"
  }
}

$exitCode = 1
try {
  # UE writes startup diagnostics to stderr (for example when no OpenXR
  # runtime is installed). Keep those diagnostics from becoming a terminating
  # PowerShell error while retaining the real process exit code.
  $ErrorActionPreference = "Continue"
  & $UnrealEditor $projectPath "-run=pythonscript" "-script=$Script" "-unattended" "-nop4" "-nullrhi" "-nosplash" "-nosound" "-stdout" "-FullStdOutLogOutput" "-abslog=$LogPath" *> $consoleLogPath
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = "Stop"
} finally {
  Copy-Item -LiteralPath $backupPath -Destination $projectPath -Force
  $restoredHash = (Get-FileHash -LiteralPath $projectPath -Algorithm SHA256).Hash
  if ($restoredHash -ne $originalHash) {
    throw "Project restoration hash mismatch: $restoredHash != $originalHash"
  }
}

Write-Output "Cine57 export exit code: $exitCode"
Write-Output "Project restored with SHA256: $originalHash"
exit $exitCode
