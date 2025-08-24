#!/bin/bash

# F-CRM Linux Installer
# Требует sudo права

set -e

echo "Установка F-CRM на Linux..."

# Проверка прав sudo
if [ "$EUID" -ne 0 ]; then
    echo "Требуются права sudo для установки"
    exit 1
fi

# Создание пользователя и группы
echo "Создание пользователя f-crm..."
useradd -r -s /bin/false -d /opt/f-crm f-crm || true

# Создание директории
echo "Создание директории /opt/f-crm..."
mkdir -p /opt/f-crm

# Копирование файлов
echo "Копирование файлов..."
cp -r . /opt/f-crm/
chown -R f-crm:f-crm /opt/f-crm

# Установка зависимостей Python
echo "Установка зависимостей Python..."
cd /opt/f-crm
python3 -m pip install --user -r requirements.txt

# Установка systemd службы
echo "Установка systemd службы..."
cp f-crm.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable f-crm.service

echo "Установка завершена!"
echo "Для запуска службы выполните: sudo systemctl start f-crm"
echo "Для проверки статуса: sudo systemctl status f-crm"
echo "Для просмотра логов: sudo journalctl -u f-crm -f"
