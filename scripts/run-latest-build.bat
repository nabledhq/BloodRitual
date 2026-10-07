@echo off
rem Launches the most recent packaged Windows build: Packaged\Windows\BloodRitual.exe (relative to the repository root).
rem Package it from the editor first: Platforms / Windows / Package Project (Development), output folder "Packaged".
rem Any arguments are passed through to the game executable.
setlocal

set "REPO_ROOT=%~dp0.."
for %%I in ("%REPO_ROOT%") do set "REPO_ROOT=%%~fI"
set "GAME_EXE=%REPO_ROOT%\Packaged\Windows\BloodRitual.exe"

if not exist "%GAME_EXE%" (
    echo [run-latest-build] ERROR: No packaged build found at "%GAME_EXE%".
    echo [run-latest-build] Package the project first: in Unreal Editor choose Platforms ^> Windows ^> Package Project
    echo [run-latest-build] with the Development configuration and select "%REPO_ROOT%\Packaged" as the output folder.
    exit /b 1
)

echo [run-latest-build] Launching "%GAME_EXE%"
start "" "%GAME_EXE%" %*
exit /b 0
