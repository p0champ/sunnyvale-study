param(
    [Parameter(Mandatory = $true)][string]$BridgeDirectory,
    [Parameter(Mandatory = $true)][string]$NodePath,
    [string]$PrivateDirectory,
    [ValidateRange(1024, 65535)][int]$Port = 8130
)
$ErrorActionPreference = 'Stop'
$bridgeLock = [System.Threading.Mutex]::new($false, "Local\SunnyvaleStudy.AutoStart.$Port")
$ownsLock = $false
try {
    try { $ownsLock = $bridgeLock.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $ownsLock = $true }
    if (-not $ownsLock) { exit 0 }
    while ($true) {
        # Check before launching Node: a duplicate server could otherwise touch
        # backup files before its existing EADDRINUSE / exit-code-3 guard runs.
        $probe = [System.Net.Sockets.TcpClient]::new()
        try { $occupied = $probe.ConnectAsync('127.0.0.1', $Port).Wait(1000) -and $probe.Connected }
        catch { $occupied = $false }
        finally { $probe.Dispose() }
        if ($occupied) { exit 0 }

        if (-not (Test-Path -LiteralPath (Join-Path $BridgeDirectory 'server.mjs')) -or -not (Test-Path -LiteralPath $NodePath)) {
            Start-Sleep -Seconds 30
            continue
        }
        $settingsRoot = if ($PrivateDirectory) { $PrivateDirectory } else { Join-Path $BridgeDirectory 'private' }
        New-Item -ItemType Directory -Path $settingsRoot -Force | Out-Null
        $env:BRIDGE_PORT = [string]$Port
        $env:BRIDGE_BROWSER = 'extension'
        $env:BRIDGE_TUNNEL = '1'
        if ($PrivateDirectory) { $env:BRIDGE_PRIVATE_DIR = $PrivateDirectory }
        else { Remove-Item Env:BRIDGE_PRIVATE_DIR -ErrorAction SilentlyContinue }
        Remove-Item Env:BRIDGE_BACKUP_DIR -ErrorAction SilentlyContinue
        $outLog = Join-Path $settingsRoot 'login-runtime.log'
        $errorLog = Join-Path $settingsRoot 'login-error.log'
        foreach ($log in @($outLog, $errorLog)) {
            if ((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 1MB) {
                Copy-Item -LiteralPath $log -Destination ($log + '.previous') -Force
            }
        }
        $bridgeChild = Start-Process -FilePath $NodePath -ArgumentList 'server.mjs' -WorkingDirectory $BridgeDirectory -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errorLog -PassThru
        $bridgeChild.WaitForExit()
        if ($bridgeChild.ExitCode -eq 3) { exit 0 }
        Start-Sleep -Seconds 5
    }
} finally {
    if ($ownsLock) { $bridgeLock.ReleaseMutex() }
    $bridgeLock.Dispose()
}
