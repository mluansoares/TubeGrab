# Compila o TubeGrab.exe (launcher) usando o csc.exe que ja vem com o
# .NET Framework do Windows. Nao precisa de SDK, Visual Studio nem internet.
#
#   powershell -ExecutionPolicy Bypass -File launcher\build-exe.ps1
#
# Saida: TubeGrab.exe na raiz do projeto, com o icone de launcher\TubeGrab.ico
# embutido no binario.
$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
$root = Split-Path -Parent $here
$source = Join-Path $here 'TubeGrabLauncher.cs'
$icon = Join-Path $here 'TubeGrab.ico'
$output = Join-Path $root 'TubeGrab.exe'

foreach ($file in @($source, $icon)) {
    if (-not (Test-Path $file)) { throw "Arquivo nao encontrado: $file" }
}

$csc = @(
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $csc) {
    throw 'csc.exe nao encontrado. O .NET Framework 4.x e necessario (vem no Windows 10/11).'
}

Write-Host "Compilando com $csc"
& $csc /nologo /target:winexe /optimize+ /codepage:65001 `
    "/win32icon:$icon" `
    "/out:$output" `
    /reference:System.Windows.Forms.dll `
    "$source"

if ($LASTEXITCODE -ne 0) { throw "Falha na compilacao (csc exit $LASTEXITCODE)." }

$exe = Get-Item $output
$version = $exe.VersionInfo
Write-Host ''
Write-Host ("ok - {0} ({1} bytes)" -f $exe.Name, $exe.Length)
Write-Host ("     produto : {0}" -f $version.ProductName)
Write-Host ("     versao  : {0}" -f $version.FileVersion)
