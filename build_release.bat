@echo off
setlocal EnableDelayedExpansion

:: Ensure we are in the project root directory
cd /d "%~dp0"

title Finance OS - Release Build Script

:: Check if Flutter is available in PATH
where flutter >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Flutter SDK was not found in your PATH.
    echo Please make sure Flutter is installed and added to your environment variables.
    echo.
    pause
    exit /b 1
)

:: Handle command-line arguments if provided
if /i "%~1"=="windows" goto :build_windows
if /i "%~1"=="win"     goto :build_windows
if /i "%~1"=="apk"     goto :build_apk
if /i "%~1"=="android" goto :build_apk
if /i "%~1"=="all"     goto :build_all
if /i "%~1"=="both"    goto :build_all
if /i "%~1"=="clean"   goto :clean_project
if /i "%~1"=="help"    goto :show_help
if not "%~1"=="" (
    echo [ERROR] Unknown option: %~1
    goto :show_help
)

:menu
cls
echo =======================================================
echo              Finance OS - Release Builder              
echo =======================================================
echo.
echo   [1] Build Windows Release (.exe)
echo   [2] Build Android APK Release (.apk)
echo   [3] Build Both (Windows + Android APK)
echo   [4] Run Flutter Clean & Pub Get
echo   [5] Exit
echo.
echo =======================================================
set /p choice="Select an option [1-5]: "

if "%choice%"=="1" goto :build_windows
if "%choice%"=="2" goto :build_apk
if "%choice%"=="3" goto :build_all
if "%choice%"=="4" goto :clean_project
if "%choice%"=="5" goto :exit_script
echo.
echo Invalid selection. Please choose 1, 2, 3, 4, or 5.
timeout /t 2 >nul
goto :menu

:show_help
echo.
echo Usage: build_release.bat [windows ^| apk ^| all ^| clean ^| help]
echo.
echo Options:
echo   windows / win   Build Windows Release executable
echo   apk / android   Build Android Release APK
echo   all / both      Build both Windows and Android Release
echo   clean           Run flutter clean and flutter pub get
echo   help            Show this help message
echo.
goto :end

:clean_project
echo.
echo =======================================================
echo  Cleaning project and resolving dependencies...
echo =======================================================
call flutter clean
if %ERRORLEVEL% neq 0 (
    echo [ERROR] 'flutter clean' failed.
    goto :end
)
call flutter pub get
if %ERRORLEVEL% neq 0 (
    echo [ERROR] 'flutter pub get' failed.
    goto :end
)
echo.
echo [SUCCESS] Project cleaned and dependencies resolved.
echo.
if "%~1"=="" (
    pause
    goto :menu
)
goto :end

:build_windows
echo.
echo =======================================================
echo  Building Windows Release...
echo =======================================================
call flutter pub get
if %ERRORLEVEL% neq 0 (
    echo [ERROR] 'flutter pub get' failed.
    goto :end
)

call dart run tool/build_portal.dart
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Portal generation failed.
    goto :end
)

call flutter build windows --release
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Windows release build failed!
    goto :end
)

echo.
echo =======================================================
echo  [SUCCESS] Windows Release Build Completed!
echo  Output directory:
echo  %~dp0build\windows\x64\runner\Release\
echo =======================================================
echo.
if "%~1"=="" if not "%choice%"=="3" pause
goto :end

:build_apk
echo.
echo =======================================================
echo  Building Android APK Release...
echo =======================================================
call flutter pub get
if %ERRORLEVEL% neq 0 (
    echo [ERROR] 'flutter pub get' failed.
    goto :end
)

call dart run tool/build_portal.dart
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Portal generation failed.
    goto :end
)

call flutter build apk --release
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Android APK release build failed!
    goto :end
)

echo.
echo =======================================================
echo  [SUCCESS] Android APK Release Build Completed!
echo  Output APK:
echo  %~dp0build\app\outputs\flutter-apk\app-release.apk
echo =======================================================
echo.
if "%~1"=="" if not "%choice%"=="3" pause
goto :end

:build_all
echo.
echo =======================================================
echo  Building Both Windows and Android APK Release...
echo =======================================================
call :build_windows
if %ERRORLEVEL% neq 0 goto :end
call :build_apk
if %ERRORLEVEL% neq 0 goto :end

echo.
echo =======================================================
echo  [SUCCESS] ALL BUILDS COMPLETED SUCCESSFULLY!
echo =======================================================
echo  - Windows Build: %~dp0build\windows\x64\runner\Release\
echo  - Android APK:   %~dp0build\app\outputs\flutter-apk\app-release.apk
echo =======================================================
echo.
if "%~1"=="" pause
goto :end

:exit_script
echo Exiting...
goto :end

:end
endlocal
