$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath 'bin/cloudflared.exe')) {
    New-Item -ItemType Directory -Path bin -Force | Out-Null
    Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'bin/cloudflared.exe'
    $bridgeSignature = Get-AuthenticodeSignature -LiteralPath 'bin/cloudflared.exe'
    if ($bridgeSignature.Status -ne 'Valid' -or $bridgeSignature.SignerCertificate.Subject -notmatch 'Cloudflare') {
        throw 'The secure relay signature could not be verified. Do not run it.'
    }
}
