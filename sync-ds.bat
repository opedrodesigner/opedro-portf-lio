@echo off
chcp 65001 >nul
echo ================================================
echo  Sincronizando Design System --- Portfolio v5
echo ================================================
echo.

set "DS_DIR=%~dp0..\..\DEsign system"
set "ASSETS_DIR=%~dp0assets"

xcopy /Y "%DS_DIR%\tokens.css" "%ASSETS_DIR%\" >nul 2>&1
if %errorlevel% equ 0 (
  echo [OK] tokens.css atualizado
) else (
  echo [ERRO] Nao foi possivel copiar tokens.css
  echo        Pasta esperada: %DS_DIR%
)

xcopy /Y "%DS_DIR%\components.css" "%ASSETS_DIR%\" >nul 2>&1
if %errorlevel% equ 0 (
  echo [OK] components.css atualizado
) else (
  echo [ERRO] Nao foi possivel copiar components.css
)

echo.
echo Pronto! Recarregue os HTMLs no browser para ver as mudancas.
pause
