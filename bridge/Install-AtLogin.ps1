param(
    [string]$BridgeDirectory = $PSScriptRoot,
    [string]$PrivateDirectory,
    [string]$StartupDirectory = [Environment]::GetFolderPath('Startup'),
    [string]$StateDirectory = (Join-Path $env:LOCALAPPDATA 'SunnyvaleStudy\BridgeStartup'),
    [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'
$shortcutPath = Join-Path $StartupDirectory 'Sunnyvale Browser Bridge.lnk'
if ($Uninstall) {
    if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
    Write-Output 'Automatic startup is off. The current bridge is left running.'
    exit 0
}
$bridgeRoot = (Resolve-Path -LiteralPath $BridgeDirectory).Path
if (-not (Test-Path -LiteralPath (Join-Path $bridgeRoot 'server.mjs')) -or -not (Test-Path -LiteralPath (Join-Path $bridgeRoot 'node_modules\ws'))) {
    throw 'Choose an installed Sunnyvale bridge folder first.'
}
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
if ($PrivateDirectory) { $PrivateDirectory = (Resolve-Path -LiteralPath $PrivateDirectory).Path }
New-Item -ItemType Directory -Path $StartupDirectory, $StateDirectory -Force | Out-Null
$runner = Join-Path $StateDirectory 'Run-AtLogin.ps1'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Run-AtLogin.ps1') -Destination $runner -Force
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $PSHOME 'powershell.exe'
$shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $runner + '" -BridgeDirectory "' + $bridgeRoot + '" -NodePath "' + $nodePath + '"'
if ($PrivateDirectory) { $shortcut.Arguments += ' -PrivateDirectory "' + $PrivateDirectory + '"' }
$shortcut.WorkingDirectory = $StateDirectory
$shortcut.WindowStyle = 7
$shortcut.Description = 'Start the existing Sunnyvale bridge at Windows login; skip if already running.'
$shortcut.Save()
Write-Output 'Automatic startup is on for this Windows user. No second bridge was started.'
