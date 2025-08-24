@echo off
echo Установка F-CRM как службы Windows...

REM Проверка прав администратора
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Права администратора получены.
) else (
    echo Требуются права администратора для установки службы.
    pause
    exit /b 1
)

REM Путь к Python и проекту
set PYTHON_PATH=python
set PROJECT_PATH=%~dp0
set SERVICE_NAME=F-CRM
set SERVICE_DISPLAY_NAME=F-CRM 3D Printer Monitor
set SERVICE_DESCRIPTION=Система мониторинга и управления 3D-принтерами

REM Создание bat файла для запуска службы
echo @echo off > "%PROJECT_PATH%run_service.bat"
echo cd /d "%PROJECT_PATH%" >> "%PROJECT_PATH%run_service.bat"
echo set FLASK_ENV=production >> "%PROJECT_PATH%run_service.bat"
echo "%PYTHON_PATH%" app.py >> "%PROJECT_PATH%run_service.bat"

REM Установка службы
sc create "%SERVICE_NAME%" binPath= "%PROJECT_PATH%run_service.bat" start= auto DisplayName= "%SERVICE_DISPLAY_NAME%"
sc description "%SERVICE_NAME%" "%SERVICE_DESCRIPTION%"

if %errorLevel% == 0 (
    echo Служба %SERVICE_NAME% успешно установлена.
    echo Для запуска службы выполните: sc start %SERVICE_NAME%
    echo Для остановки службы выполните: sc stop %SERVICE_NAME%
    echo Для удаления службы выполните: sc delete %SERVICE_NAME%
) else (
    echo Ошибка при установке службы.
)

pause
