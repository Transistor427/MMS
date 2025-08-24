# Инструкция по развертыванию F-CRM

## Быстрый старт

### 1. Подготовка системы

#### Windows
```bash
# Клонирование репозитория
git clone <url-репозитория>
cd F-CRM

# Создание виртуального окружения
python -m venv venv
venv\Scripts\activate

# Установка зависимостей
pip install -r requirements.txt

# Запуск системы
python app.py
```

#### Linux
```bash
# Клонирование репозитория
git clone <url-репозитория>
cd F-CRM

# Создание виртуального окружения
python3 -m venv venv
source venv/bin/activate

# Установка зависимостей
pip install -r requirements.txt

# Запуск системы
python app.py
```

### 2. Настройка переменных окружения

Создайте файл `.env` на основе `env_example.txt`:

```bash
# Windows
copy env_example.txt .env

# Linux
cp env_example.txt .env
```

Отредактируйте файл `.env` под ваши нужды.

## Развертывание в продакшене

### Windows (как служба)

1. **Установка как служба Windows:**
   ```bash
   # Запустите от имени администратора
   install_service.bat
   ```

2. **Управление службой:**
   ```bash
   # Запуск
   sc start F-CRM
   
   # Остановка
   sc stop F-CRM
   
   # Удаление
   sc delete F-CRM
   ```

### Linux (systemd)

1. **Автоматическая установка:**
   ```bash
   sudo chmod +x install_linux.sh
   sudo ./install_linux.sh
   ```

2. **Ручная установка:**
   ```bash
   # Создание пользователя
   sudo useradd -r -s /bin/false -d /opt/f-crm f-crm
   
   # Копирование файлов
   sudo mkdir -p /opt/f-crm
   sudo cp -r . /opt/f-crm/
   sudo chown -R f-crm:f-crm /opt/f-crm
   
   # Установка зависимостей
   cd /opt/f-crm
   sudo python3 -m pip install -r requirements.txt
   
   # Установка службы
   sudo cp f-crm.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable f-crm.service
   ```

3. **Управление службой:**
   ```bash
   # Запуск
   sudo systemctl start f-crm
   
   # Остановка
   sudo systemctl stop f-crm
   
   # Статус
   sudo systemctl status f-crm
   
   # Логи
   sudo journalctl -u f-crm -f
   ```

### Docker (опционально)

Создайте `Dockerfile`:

```dockerfile
FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 5000

CMD ["python", "app.py"]
```

Сборка и запуск:
```bash
docker build -t f-crm .
docker run -p 5000:5000 f-crm
```

## Настройка веб-сервера

### Nginx (рекомендуется)

Создайте конфигурацию `/etc/nginx/sites-available/f-crm`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Активация:
```bash
sudo ln -s /etc/nginx/sites-available/f-crm /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Apache

Создайте конфигурацию `/etc/apache2/sites-available/f-crm.conf`:

```apache
<VirtualHost *:80>
    ServerName your-domain.com
    
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:5000/
    ProxyPassReverse / http://127.0.0.1:5000/
    
    ErrorLog ${APACHE_LOG_DIR}/f-crm_error.log
    CustomLog ${APACHE_LOG_DIR}/f-crm_access.log combined
</VirtualHost>
```

Активация:
```bash
sudo a2ensite f-crm
sudo a2enmod proxy proxy_http
sudo systemctl reload apache2
```

## SSL сертификат (Let's Encrypt)

```bash
# Установка Certbot
sudo apt install certbot python3-certbot-nginx

# Получение сертификата
sudo certbot --nginx -d your-domain.com

# Автоматическое обновление
sudo crontab -e
# Добавьте строку:
# 0 12 * * * /usr/bin/certbot renew --quiet
```

## Мониторинг и логирование

### Настройка логирования

Система автоматически создает логи в папке `logs/`. Для ротации логов:

```bash
# Создание logrotate конфигурации
sudo tee /etc/logrotate.d/f-crm << EOF
/opt/f-crm/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 f-crm f-crm
}
EOF
```

### Мониторинг с помощью systemd

```bash
# Проверка статуса
sudo systemctl status f-crm

# Просмотр логов
sudo journalctl -u f-crm -f

# Перезапуск при сбое
sudo systemctl restart f-crm
```

## Резервное копирование

Создайте скрипт резервного копирования `/opt/backup-f-crm.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/backup/f-crm"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Резервное копирование данных
tar -czf $BACKUP_DIR/f-crm_$DATE.tar.gz \
    /opt/f-crm/printers.json \
    /opt/f-crm/print_jobs.json \
    /opt/f-crm/uploads/

# Удаление старых резервных копий (старше 30 дней)
find $BACKUP_DIR -name "f-crm_*.tar.gz" -mtime +30 -delete
```

Добавьте в crontab:
```bash
# Ежедневное резервное копирование в 2:00
0 2 * * * /opt/backup-f-crm.sh
```

## Обновление системы

### Автоматическое обновление

Создайте скрипт `/opt/update-f-crm.sh`:

```bash
#!/bin/bash
cd /opt/f-crm

# Остановка службы
sudo systemctl stop f-crm

# Обновление кода
git pull origin main

# Обновление зависимостей
pip install -r requirements.txt

# Запуск службы
sudo systemctl start f-crm

echo "F-CRM обновлен: $(date)"
```

### Ручное обновление

```bash
cd /opt/f-crm
sudo systemctl stop f-crm
git pull origin main
pip install -r requirements.txt
sudo systemctl start f-crm
```

## Устранение неполадок

### Проверка подключения к принтерам

```bash
# Проверка доступности Moonraker
curl http://PRINTER_IP:7125/printer/info

# Проверка веб-камеры
curl http://PRINTER_IP:8080/?action=snapshot
```

### Проверка логов

```bash
# Логи приложения
tail -f /opt/f-crm/logs/f-crm.log

# Логи systemd
sudo journalctl -u f-crm -f

# Логи nginx
sudo tail -f /var/log/nginx/error.log
```

### Перезапуск служб

```bash
# Перезапуск F-CRM
sudo systemctl restart f-crm

# Перезапуск nginx
sudo systemctl reload nginx

# Перезапуск всей системы
sudo systemctl restart f-crm nginx
```

## Безопасность

### Настройка файрвола

```bash
# UFW (Ubuntu)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 5000/tcp  # только для локального доступа

# iptables
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
```

### Обновление системы

```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade

# CentOS/RHEL
sudo yum update
```

## Производительность

### Оптимизация Python

```bash
# Установка дополнительных пакетов для производительности
pip install gunicorn uvicorn

# Запуск с Gunicorn
gunicorn -w 4 -b 127.0.0.1:5000 wsgi:app
```

### Настройка Nginx

Добавьте в конфигурацию nginx:

```nginx
# Кэширование статических файлов
location /static/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# Сжатие
gzip on;
gzip_types text/plain text/css application/json application/javascript;
```

## Поддержка

При возникновении проблем:

1. Проверьте логи системы
2. Убедитесь в правильности конфигурации
3. Проверьте сетевое подключение к принтерам
4. Создайте issue в репозитории проекта
