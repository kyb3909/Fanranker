$url = 'https://github.com/cli/cli/releases/download/v2.86.0/gh_2.86.0_windows_amd64.zip'
$zip = Join-Path $env:TEMP 'gh.zip'
$dest = Join-Path $env:LOCALAPPDATA 'gh-cli'
Write-Host 'Downloading gh CLI...'
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
Write-Host 'Extracting...'
if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
Expand-Archive -Path $zip -DestinationPath $dest -Force
Remove-Item $zip
$ghExe = Get-ChildItem -Path $dest -Filter 'gh.exe' -Recurse | Select-Object -First 1 -ExpandProperty FullName
Write-Host "gh installed at: $ghExe"
