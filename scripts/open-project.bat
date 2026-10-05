@echo off
rem Opens Seminole.uproject in Unreal Editor 5.8.
rem
rem   1. If UE_ROOT is set and %UE_ROOT%\Engine\Binaries\Win64\UnrealEditor.exe exists, that editor is used.
rem      Example:  set "UE_ROOT=path\to\your\UE_5.8"
rem   2. Otherwise the .uproject is opened through the Windows file association (set up by the Epic Games Launcher).
rem
rem The repository root is resolved relative to this script, so it can be run from any directory.
setlocal

set "REPO_ROOT=%~dp0.."
for %%I in ("%REPO_ROOT%") do set "REPO_ROOT=%%~fI"
set "UPROJECT=%REPO_ROOT%\Seminole.uproject"

if not exist "%UPROJECT%" (
    echo [open-project] ERROR: Seminole.uproject not found at "%UPROJECT%".
    exit /b 1
)

if not defined UE_ROOT goto :use_association

set "EDITOR_EXE=%UE_ROOT%\Engine\Binaries\Win64\UnrealEditor.exe"
if not exist "%EDITOR_EXE%" (
    echo [open-project] UE_ROOT is set to "%UE_ROOT%" but "%EDITOR_EXE%" does not exist.
    echo [open-project] Falling back to the .uproject file association.
    goto :use_association
)

echo [open-project] Launching "%EDITOR_EXE%" with "%UPROJECT%"
start "" "%EDITOR_EXE%" "%UPROJECT%"
exit /b 0

:use_association
assoc .uproject >nul 2>&1
if errorlevel 1 (
    echo [open-project] ERROR: No Unreal Editor found.
    echo [open-project]   - .uproject files have no file association on this machine, and
    echo [open-project]   - UE_ROOT is not set to an Unreal Engine 5.8 installation.
    echo [open-project] Install Unreal Engine 5.8 from the Epic Games Launcher, or set UE_ROOT, for example:
    echo [open-project]   set "UE_ROOT=path\to\your\UE_5.8"
    exit /b 1
)

echo [open-project] Opening "%UPROJECT%" through the .uproject file association
start "" "%UPROJECT%"
if errorlevel 1 (
    echo [open-project] ERROR: Windows could not open "%UPROJECT%". Set UE_ROOT to your Unreal Engine 5.8 installation and retry.
    exit /b 1
)
exit /b 0
