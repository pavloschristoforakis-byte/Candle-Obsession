# Runs the whole site for development, in one terminal:
#   - the front end (ClientApp) rebuilds itself whenever you save a file in ClientApp/src
#   - the website restarts itself whenever C# or Razor files change
# Usage (from this folder):   .\dev.ps1            -> http://localhost:5199
#                             .\dev.ps1 -Port 5300
# Press Ctrl+C to stop both. After editing Data/products.json, stop and start again.
param([int]$Port = 5199)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$client = Join-Path $root 'ClientApp'

$env:ASPNETCORE_ENVIRONMENT = 'Development'
if (-not $env:Admin__Password) {
    # Local-only password so /admin works while developing. Never use this on the live site.
    $env:Admin__Password = 'local-dev-password-only'
}

if (-not (Test-Path (Join-Path $client 'node_modules'))) {
    Write-Host 'Installing front-end packages (first run only)...'
    npm ci --prefix $client
}
Write-Host 'Building the front end...'
npm run build --prefix $client
if ($LASTEXITCODE -ne 0) { throw 'Front-end build failed. See the errors above.' }

# Front-end rebuild-on-save, in the background of this same window.
$watcher = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'watch' -WorkingDirectory $client -NoNewWindow -PassThru

try {
    Write-Host ''
    Write-Host "Site: http://localhost:$Port   Admin: http://localhost:$Port/admin (password: $env:Admin__Password)"
    Write-Host 'Press Ctrl+C to stop.'
    Write-Host ''
    dotnet watch run --project (Join-Path $root 'Candle_Obsession.csproj') --no-launch-profile --urls "http://localhost:$Port"
}
finally {
    # Stop the front-end watcher and the node process it started.
    if ($watcher -and -not $watcher.HasExited) { taskkill /PID $watcher.Id /T /F | Out-Null }
}
