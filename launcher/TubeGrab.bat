@echo off
rem ============================================================
rem  TubeGrab - inicia tudo com um duplo clique
rem  Fica em launcher/ e roda a partir da raiz do projeto.
rem    1) confere Node.js + npm      2) instala dependencias
rem    3) baixa yt-dlp + ffmpeg      4) sobe o servidor
rem    5) abre o navegador na porta do .env
rem ============================================================
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0.."
title TubeGrab

echo.
echo  ============================================================
echo   TubeGrab
echo  ============================================================
echo.

call :step 1 4 "Conferindo Node.js e npm"
call :check_node
if errorlevel 1 goto :erro

call :step 2 4 "Conferindo dependencias do projeto"
if exist "node_modules\express\package.json" (
  echo   ok - ja instaladas
) else (
  echo   instalando com npm install...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :erro
)

call :step 3 4 "Conferindo yt-dlp e ffmpeg"
set "FALTA="
if not exist "bin\yt-dlp.exe" set "FALTA=1"
if not exist "bin\ffmpeg.exe" set "FALTA=1"
if not exist "bin\ffprobe.exe" set "FALTA=1"
if defined FALTA (
  echo   baixando - cerca de 130 MB, so na primeira vez...
  call npm run setup
  if errorlevel 1 goto :erro
) else (
  echo   ok - ja instalados
)

call :step 4 4 "Subindo o servidor"
call :read_port

rem Se a porta ja responde, o app ja esta rodando: so abre o navegador.
rem Teste em 127.0.0.1 (e nao "localhost"): o Windows tenta ::1 primeiro e
rem perde ~2 s antes de cair no IPv4, o que ja estourava o timeout.
curl -s -o nul --max-time 2 --noproxy "*" "http://127.0.0.1:!PORT!/api/health" >nul 2>&1
if not errorlevel 1 (
  echo   o TubeGrab ja esta rodando na porta !PORT!
  start "" "http://localhost:!PORT!"
  goto :fim
)

echo   endereco: http://localhost:!PORT!
echo   abrindo o navegador assim que o servidor responder...
call :open_browser

call npm start

echo.
echo   Servidor encerrado.
goto :fim


rem ============================================================
rem  Sub-rotinas
rem ============================================================

:step
echo.
echo  [%1/%2] %~3
exit /b 0

:check_node
where npm >nul 2>&1
if errorlevel 1 goto :install_node
set "MAJOR="
for /f "tokens=1 delims=v." %%V in ('node -v 2^>nul') do set "MAJOR=%%V"
if not defined MAJOR goto :install_node
if !MAJOR! LSS 22 goto :older_node
for /f "delims=" %%V in ('node -v') do set "NODE_VER=%%V"
for /f "delims=" %%V in ('npm -v 2^>nul') do set "NPM_VER=%%V"
echo   ok - Node.js !NODE_VER! com npm !NPM_VER!
exit /b 0

:older_node
echo   Node.js !MAJOR!.x e antigo; o app precisa do 22.5 ou superior.

:install_node
echo   instalando Node.js LTS...
where winget >nul 2>&1
if errorlevel 1 goto :node_msi
winget install --exact --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --disable-interactivity
set "PATH=%ProgramFiles%\nodejs;%PATH%"
where npm >nul 2>&1
if not errorlevel 1 goto :node_ok

:node_msi
echo   baixando o instalador oficial do nodejs.org...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$i=Invoke-RestMethod 'https://nodejs.org/dist/index.json';$v=($i|Where-Object lts|Select-Object -First 1).version;$f=Join-Path $env:TEMP ('node-'+$v+'-x64.msi');Invoke-WebRequest ('https://nodejs.org/dist/'+$v+'/node-'+$v+'-x64.msi') -OutFile $f;Start-Process msiexec.exe -Wait -ArgumentList '/i',$f,'/qn'"
set "PATH=%ProgramFiles%\nodejs;%PATH%"

:node_ok
where npm >nul 2>&1
if errorlevel 1 (
  echo.
  echo   [X] Node.js nao ficou disponivel neste console.
  echo       Feche esta janela e rode o TubeGrab novamente.
  exit /b 1
)
for /f "delims=" %%V in ('node -v') do set "NODE_VER=%%V"
echo   ok - Node.js !NODE_VER! instalado
exit /b 0

:read_port
set "PORT=3100"
if not exist ".env" exit /b 0
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b /r /i /c:" *PORT *=" ".env"`) do set "P=%%B"
if not defined P exit /b 0
set "P=!P: =!"
if "!P:~0,1!"=="" set "P=!P:~1,-1!"
echo !P!|findstr /r /c:"^[0-9][0-9]*$" >nul
if errorlevel 1 (
  echo   aviso: PORT=!P! invalido no .env - usando 3100
  exit /b 0
)
set "PORT=!P!"
exit /b 0

:open_browser
rem Roda em segundo plano (start): espera a porta abrir e so entao chama o
rem navegador, sem travar o "npm start" que vem logo depois. TcpClient em
rem 127.0.0.1 nao depende de DNS, proxy nem de "localhost" (IPv6 x IPv4).
start "" powershell -NoProfile -WindowStyle Hidden -Command "$ok=$false;$i=0;while($i -lt 120 -and -not $ok){try{$c=New-Object Net.Sockets.TcpClient;$c.Connect('127.0.0.1',!PORT!);$c.Close();$ok=$true}catch{Start-Sleep -Milliseconds 500;$i++}};if($ok){Start-Process 'http://localhost:!PORT!'}"
exit /b 0


rem ============================================================
rem  Fim
rem ============================================================

:erro
echo.
echo  ------------------------------------------------------------
echo   Nao foi possivel iniciar o TubeGrab.
echo   Veja a mensagem de erro acima.
echo  ------------------------------------------------------------
echo.
pause
exit /b 1

:fim
echo.
pause
exit /b 0
