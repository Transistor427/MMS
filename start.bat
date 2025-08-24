@echo off
echo Запуск F-CRM системы мониторинга 3D принтеров...
echo.

REM Проверяем наличие Python
python --version >nul 2>&1
if errorlevel 1 (
    echo Ошибка: Python не найден в PATH
    echo Установите Python или добавьте его в PATH
    pause
    exit /b 1
)

REM Запускаем приложение
echo Запуск приложения...
python app.py

pause
