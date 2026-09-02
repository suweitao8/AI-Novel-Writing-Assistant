param(
  [string]$UnrealEditor = "D:/Epic Games/UE_5.7/Engine/Binaries/Win64/UnrealEditor-Cmd.exe",
  [string]$Project = "",
  [string]$Script,
  [string]$Selection,
  [string]$ManagedRoot = "D:/UnrealWorkspace/Cine57-exported",
  [string]$RunId = "legacy-cine57-export",
  [string]$OutputDir = "",
  [string]$LogPath = "",
  [string]$LightForgePlugin = ""
)

$ErrorActionPreference = "Stop"
$defaultScript = Join-Path $PSScriptRoot "export_cine57_animation_catalog.py"
$defaultSelection = Join-Path $PSScriptRoot "animationCatalogSelection.json"
$scriptToResolve = if ([string]::IsNullOrWhiteSpace($Script)) { $defaultScript } else { $Script }
$selectionToResolve = if ([string]::IsNullOrWhiteSpace($Selection)) { $defaultSelection } else { $Selection }
$scriptPath = (Resolve-Path -LiteralPath $scriptToResolve).Path
$selectionPath = (Resolve-Path -LiteralPath $selectionToResolve).Path
$selectionData = Get-Content -LiteralPath $selectionPath -Raw | ConvertFrom-Json
$projectToResolve = if ([string]::IsNullOrWhiteSpace($Project)) {
  if ([string]::IsNullOrWhiteSpace([string]$selectionData.sourceProjectPath)) {
    "D:/UnrealWorkspace/Cine57/Cine57.uproject"
  } else {
    [string]$selectionData.sourceProjectPath
  }
} else {
  $Project
}
$projectPath = (Resolve-Path -LiteralPath $projectToResolve).Path
if ($RunId -notmatch '^[a-z0-9][a-z0-9-]*$') {
  throw "RunId 只能使用小写字母、数字和连字符：$RunId"
}
$managedRootPath = [System.IO.Path]::GetFullPath($ManagedRoot)
$runDirPath = Join-Path (Join-Path $managedRootPath "runs") $RunId
$outputDirToUse = if ([string]::IsNullOrWhiteSpace($OutputDir)) { Join-Path $runDirPath "fbx" } else { $OutputDir }
$logPathToUse = if ([string]::IsNullOrWhiteSpace($LogPath)) { Join-Path $runDirPath "logs/ue-export.log" } else { $LogPath }
$outputDirPath = [System.IO.Path]::GetFullPath($outputDirToUse)
$LogPath = [System.IO.Path]::GetFullPath($logPathToUse)
$consoleLogPath = "$LogPath.console.log"
$backupDirPath = Join-Path $runDirPath "backups"
New-Item -ItemType Directory -Force -Path $outputDirPath, (Split-Path -Parent $LogPath), $backupDirPath | Out-Null
$lightForgePath = $null
if ([string]::IsNullOrWhiteSpace($LightForgePlugin)) {
  $projectLightForge = Join-Path (Split-Path -Parent $projectPath) "Plugins/LightForge/LightForge.uplugin"
  if (Test-Path -LiteralPath $projectLightForge) {
    $lightForgePath = (Resolve-Path -LiteralPath $projectLightForge).Path
  }
} else {
  $lightForgePath = (Resolve-Path -LiteralPath $LightForgePlugin).Path
}
$lightForgeDisabledPath = if ($lightForgePath) { "$lightForgePath.disabled" } else { $null }
$projectBaseName = [System.IO.Path]::GetFileNameWithoutExtension($projectPath)
$backupPath = Join-Path $backupDirPath "$projectBaseName.before-export.uproject"
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
$lightForgeRenamed = $false
$previousSelectionEnv = $env:CINE57_ANIMATION_SELECTION
$previousOutputDirEnv = $env:CINE57_ANIMATION_OUTPUT_DIR
try {
  if ($lightForgePath -and (Test-Path -LiteralPath $lightForgeDisabledPath)) {
    throw "LightForge disabled marker already exists: $lightForgeDisabledPath"
  }
  if ($lightForgePath) {
    Move-Item -LiteralPath $lightForgePath -Destination $lightForgeDisabledPath
    $lightForgeRenamed = $true
  }
  $env:CINE57_ANIMATION_SELECTION = $selectionPath
  $env:CINE57_ANIMATION_OUTPUT_DIR = $outputDirPath
  # UE writes startup diagnostics to stderr (for example when no OpenXR
  # runtime is installed). Keep those diagnostics from becoming a terminating
  # PowerShell error while retaining the real process exit code.
  $ErrorActionPreference = "Continue"
  & $UnrealEditor $projectPath "-run=pythonscript" "-script=$scriptPath" "--selection=$selectionPath" "--output-dir=$outputDirPath" "-unattended" "-nop4" "-nullrhi" "-nosplash" "-nosound" "-stdout" "-FullStdOutLogOutput" "-abslog=$LogPath" *> $consoleLogPath
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = "Stop"
} finally {
  if ($null -eq $previousSelectionEnv) {
    Remove-Item Env:CINE57_ANIMATION_SELECTION -ErrorAction SilentlyContinue
  } else {
    $env:CINE57_ANIMATION_SELECTION = $previousSelectionEnv
  }
  if ($null -eq $previousOutputDirEnv) {
    Remove-Item Env:CINE57_ANIMATION_OUTPUT_DIR -ErrorAction SilentlyContinue
  } else {
    $env:CINE57_ANIMATION_OUTPUT_DIR = $previousOutputDirEnv
  }
  if ($lightForgeRenamed) {
    Move-Item -LiteralPath $lightForgeDisabledPath -Destination $lightForgePath
  }
  Copy-Item -LiteralPath $backupPath -Destination $projectPath -Force
  $restoredHash = (Get-FileHash -LiteralPath $projectPath -Algorithm SHA256).Hash
  if ($restoredHash -ne $originalHash) {
    throw "Project restoration hash mismatch: $restoredHash != $originalHash"
  }
}

Write-Output "Cine57 export exit code: $exitCode"
Write-Output "Project restored with SHA256: $originalHash"
exit $exitCode
