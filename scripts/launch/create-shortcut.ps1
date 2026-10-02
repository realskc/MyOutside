# Create "MyOutside" desktop shortcut (silent dev launcher)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
$desktop = [Environment]::GetFolderPath("Desktop")
$vbs = Join-Path $repoRoot "scripts\launch\MyOutside.vbs"
$lnkPath = Join-Path $desktop "MyOutside.lnk"

if (-not (Test-Path $vbs)) { throw "launcher not found: $vbs" }

$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($lnkPath)
$lnk.TargetPath = "$env:WINDIR\System32\wscript.exe"
$lnk.Arguments = '"' + $vbs + '"'
$lnk.WorkingDirectory = $repoRoot
$lnk.Description = "MyOutside dev launcher"
$icon = Join-Path $repoRoot "apps\host\node_modules\electron\dist\electron.exe"
if (Test-Path $icon) { $lnk.IconLocation = "$icon,0" }
$lnk.Save()
Write-Output "shortcut created: $lnkPath"
Write-Output "target: $($lnk.TargetPath) $($lnk.Arguments)"
