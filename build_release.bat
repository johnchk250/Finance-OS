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
call :resolve_dependencies
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
call :resolve_dependencies
if %ERRORLEVEL% neq 0 (
    echo [ERROR] 'flutter pub get' failed.
    goto :end
)

call dart run tool/build_portal.dart
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Portal generation failed.
    goto :end
)

:: CMake stores the absolute checkout path in its cache. If this project was
:: moved or renamed, remove only the generated Windows build tree so CMake can
:: configure it again from the current checkout.
set "WINDOWS_CMAKE_CACHE=%~dp0build\windows\x64\CMakeCache.txt"
if exist "%WINDOWS_CMAKE_CACHE%" (
    set "CMAKE_SOURCE_DIR="
    for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"CMAKE_HOME_DIRECTORY:INTERNAL=" "%WINDOWS_CMAKE_CACHE%"') do set "CMAKE_SOURCE_DIR=%%B"
    set "CMAKE_SOURCE_DIR=!CMAKE_SOURCE_DIR:/=\!"
    if defined CMAKE_SOURCE_DIR if /i not "!CMAKE_SOURCE_DIR!"=="%CD%\windows" (
        echo [INFO] Windows build cache belongs to a different checkout. Reconfiguring...
        rmdir /s /q "%~dp0build\windows"
        if exist "%~dp0build\windows" (
            echo [ERROR] Could not remove the stale Windows build cache.
            goto :end
        )
    )
)

call flutter build windows --release --no-pub
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Windows release build failed!
    goto :end
)

:: Refresh the distributable archive after each Windows release build so it
:: cannot silently remain older than the files in the Release directory.
set "WINDOWS_RELEASE_DIR=%~dp0build\windows\x64\runner\Release"
set "WINDOWS_RELEASE_ZIP=%~dp0build\FinanceOS-Windows-Release.zip"
powershell -NoProfile -Command "Compress-Archive -Path '%WINDOWS_RELEASE_DIR%' -DestinationPath '%WINDOWS_RELEASE_ZIP%' -Force"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Could not refresh the Windows release archive.
    goto :end
)

echo.
echo =======================================================
echo  [SUCCESS] Windows Release Build Completed!
echo  Output directory:
echo  %~dp0build\windows\x64\runner\Release\
echo  Release archive:
echo  %~dp0build\FinanceOS-Windows-Release.zip
echo =======================================================
echo.
if "%~1"=="" if not "%choice%"=="3" pause
goto :end

:build_apk
echo.
echo =======================================================
echo  Building Android APK Release...
echo =======================================================
call :resolve_dependencies
if %ERRORLEVEL% neq 0 (
    echo [ERROR] 'flutter pub get' failed.
    goto :end
)

call dart run tool/build_portal.dart
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Portal generation failed.
    goto :end
)

call flutter build apk --release --no-pub
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

:resolve_dependencies
set "PUB_LOG=%TEMP%\finance-os-pub-%RANDOM%.log"
call flutter pub get > "%PUB_LOG%" 2>&1
set "PUB_EXIT=%ERRORLEVEL%"
if not "%PUB_EXIT%"=="0" if exist "%PUB_LOG%" type "%PUB_LOG%"
if exist "%PUB_LOG%" del /q "%PUB_LOG%" >nul 2>&1
exit /b %PUB_EXIT%

:end
endlocal
