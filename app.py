from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests
import json
import os
import time
import threading
from datetime import datetime
import logging
from werkzeug.utils import secure_filename
from config import config

# Определение конфигурации
config_name = os.environ.get('FLASK_ENV', 'default')
app = Flask(__name__, static_folder='static', static_url_path='')
app.config.from_object(config[config_name])
config[config_name].init_app(app)

# Увеличиваем максимальный размер загружаемого файла до 500MB
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB

CORS(app, origins=app.config['CORS_ORIGINS'])

# Настройка логирования
logger = logging.getLogger(__name__)

# Конфигурация из настроек приложения
UPLOAD_FOLDER = app.config['UPLOAD_FOLDER']
ALLOWED_EXTENSIONS = app.config['ALLOWED_EXTENSIONS']
PRINTERS_FILE = app.config['PRINTERS_FILE']
PRINT_JOBS_FILE = app.config['PRINT_JOBS_FILE']

# Создание папок если не существуют
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Файлы для хранения данных
FILES_DB_FILE = os.path.join(os.path.dirname(__file__), 'data', 'files.json')
USERS_DB_FILE = os.path.join(os.path.dirname(__file__), 'data', 'users.json')
JOBS_DB_FILE = os.path.join(os.path.dirname(__file__), 'data', 'jobs.json')

# Создание папки data если не существует
os.makedirs(os.path.dirname(FILES_DB_FILE), exist_ok=True)

# Загрузка данных принтеров
def load_printers():
    if os.path.exists(PRINTERS_FILE):
        with open(PRINTERS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_printers(printers):
    with open(PRINTERS_FILE, 'w', encoding='utf-8') as f:
        json.dump(printers, f, ensure_ascii=False, indent=2)

def load_print_jobs():
    if os.path.exists(PRINT_JOBS_FILE):
        with open(PRINT_JOBS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_print_jobs(jobs):
    with open(PRINT_JOBS_FILE, 'w', encoding='utf-8') as f:
        json.dump(jobs, f, ensure_ascii=False, indent=2)

# Функции для работы с файлами
def load_files():
    if os.path.exists(FILES_DB_FILE):
        with open(FILES_DB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_files(files):
    with open(FILES_DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(files, f, ensure_ascii=False, indent=2)

# Функции для работы с пользователями
def load_users():
    if os.path.exists(USERS_DB_FILE):
        with open(USERS_DB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    # Создаем администратора по умолчанию
    default_users = [
        {
            'id': 'admin-001',
            'name': 'Администратор',
            'email': 'admin@fcrm.local',
            'role': 'admin',
            'created': datetime.now().isoformat()
        }
    ]
    save_users(default_users)
    return default_users

def save_users(users):
    with open(USERS_DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(users, f, ensure_ascii=False, indent=2)

# Функции для работы с заданиями
def load_jobs():
    if os.path.exists(JOBS_DB_FILE):
        with open(JOBS_DB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_jobs(jobs):
    with open(JOBS_DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(jobs, f, ensure_ascii=False, indent=2)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

class PrinterManager:
    def __init__(self):
        self.printers = load_printers()
        self.print_jobs = load_print_jobs()
        self.printer_status = {}
        
    def add_printer(self, name, ip_address, port=7125):
        """Добавление нового принтера"""
        printer = {
            'id': f"ZB3D-{len(self.printers)+1:03d}",
            'name': name,
            'ip_address': ip_address,
            'port': port,
            'status': 'offline',
            'last_seen': None,
            'webcam_url': f"http://{ip_address}:8080/webcam/?action=stream",
            'moonraker_url': f"http://{ip_address}:{port}"
        }
        self.printers.append(printer)
        save_printers(self.printers)
        return printer
    
    def remove_printer(self, printer_id):
        """Удаление принтера"""
        self.printers = [p for p in self.printers if p['id'] != printer_id]
        save_printers(self.printers)
        return True
    
    def get_printer_status(self, printer):
        """Получение статуса принтера через Moonraker API"""
        try:
            base_url = printer['moonraker_url']
            
            # Получение информации о принтере
            printer_info = requests.get(f"{base_url}/printer/info", timeout=5).json()
            
            # Получение статуса печати
            print_status = requests.get(f"{base_url}/printer/objects/query?print_stats", timeout=5).json()
            
            # Получение информации о температуре
            temp_info = requests.get(f"{base_url}/printer/objects/query?heater_bed&extruder", timeout=5).json()
            
            # Получение информации о файлах
            files_info = requests.get(f"{base_url}/server/files/list", timeout=5).json()
            
            status = {
                'printer_info': printer_info,
                'print_stats': print_status['result']['status']['print_stats'],
                'temperature': temp_info['result']['status'],
                'files': files_info['result'],
                'last_update': datetime.now().isoformat(),
                'online': True
            }
            
            return status
        except Exception as e:
            logger.error(f"Ошибка получения статуса принтера {printer['id']}: {str(e)}")
            return {
                'online': False,
                'error': str(e),
                'last_update': datetime.now().isoformat()
            }
    
    def upload_file(self, printer_id, file):
        """Загрузка файла на принтер"""
        printer = next((p for p in self.printers if p['id'] == printer_id), None)
        if not printer:
            return {'error': 'Принтер не найден'}
        
        try:
            filename = secure_filename(file.filename)
            file_path = os.path.join(UPLOAD_FOLDER, filename)
            file.save(file_path)
            
            # Загрузка файла на принтер через Moonraker
            with open(file_path, 'rb') as f:
                files = {'file': (filename, f, 'application/octet-stream')}
                response = requests.post(
                    f"{printer['moonraker_url']}/server/files/upload",
                    files=files,
                    timeout=30
                )
            
            if response.status_code == 200:
                return {'success': True, 'filename': filename}
            else:
                return {'error': f'Ошибка загрузки: {response.status_code}'}
                
        except Exception as e:
            logger.error(f"Ошибка загрузки файла: {str(e)}")
            return {'error': str(e)}
    
    def start_print(self, printer_id, filename):
        """Запуск печати"""
        printer = next((p for p in self.printers if p['id'] == printer_id), None)
        if not printer:
            return {'error': 'Принтер не найден'}
        
        try:
            response = requests.post(
                f"{printer['moonraker_url']}/printer/print/start",
                json={'filename': filename},
                timeout=10
            )
            
            if response.status_code == 200:
                return {'success': True}
            else:
                return {'error': f'Ошибка запуска печати: {response.status_code}'}
                
        except Exception as e:
            logger.error(f"Ошибка запуска печати: {str(e)}")
            return {'error': str(e)}
    
    def pause_print(self, printer_id):
        """Пауза печати"""
        printer = next((p for p in self.printers if p['id'] == printer_id), None)
        if not printer:
            return {'error': 'Принтер не найден'}
        
        try:
            response = requests.post(
                f"{printer['moonraker_url']}/printer/print/pause",
                timeout=10
            )
            
            if response.status_code == 200:
                return {'success': True}
            else:
                return {'error': f'Ошибка паузы: {response.status_code}'}
                
        except Exception as e:
            logger.error(f"Ошибка паузы печати: {str(e)}")
            return {'error': str(e)}
    
    def resume_print(self, printer_id):
        """Возобновление печати"""
        printer = next((p for p in self.printers if p['id'] == printer_id), None)
        if not printer:
            return {'error': 'Принтер не найден'}
        
        try:
            response = requests.post(
                f"{printer['moonraker_url']}/printer/print/resume",
                timeout=10
            )
            
            if response.status_code == 200:
                return {'success': True}
            else:
                return {'error': f'Ошибка возобновления: {response.status_code}'}
                
        except Exception as e:
            logger.error(f"Ошибка возобновления печати: {str(e)}")
            return {'error': str(e)}
    
    def cancel_print(self, printer_id):
        """Отмена печати"""
        printer = next((p for p in self.printers if p['id'] == printer_id), None)
        if not printer:
            return {'error': 'Принтер не найден'}
        
        try:
            response = requests.post(
                f"{printer['moonraker_url']}/printer/print/cancel",
                timeout=10
            )
            
            if response.status_code == 200:
                return {'success': True}
            else:
                return {'error': f'Ошибка отмены: {response.status_code}'}
                
        except Exception as e:
            logger.error(f"Ошибка отмены печати: {str(e)}")
            return {'error': str(e)}
    
    def toggle_light(self, printer_id):
        """Переключение подсветки"""
        printer = next((p for p in self.printers if p['id'] == printer_id), None)
        if not printer:
            return {'error': 'Принтер не найден'}
        
        try:
            # Получение текущего состояния подсветки
            response = requests.get(
                f"{printer['moonraker_url']}/printer/objects/query?led",
                timeout=5
            )
            
            if response.status_code == 200:
                led_status = response.json()['result']['status']['led']
                current_state = led_status.get('red', 0)
                
                # Переключение состояния
                new_state = 0 if current_state > 0 else 255
                
                # Установка нового состояния
                set_response = requests.post(
                    f"{printer['moonraker_url']}/printer/gcode/script",
                    json={'script': f'SET_LED LED=led RED={new_state} GREEN={new_state} BLUE={new_state}'},
                    timeout=10
                )
                
                if set_response.status_code == 200:
                    return {'success': True, 'state': new_state}
                else:
                    return {'error': f'Ошибка установки подсветки: {set_response.status_code}'}
            else:
                return {'error': f'Ошибка получения состояния подсветки: {response.status_code}'}
                
        except Exception as e:
            logger.error(f"Ошибка переключения подсветки: {str(e)}")
            return {'error': str(e)}

# Создание экземпляра менеджера принтеров
printer_manager = PrinterManager()

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/printers', methods=['GET'])
def get_printers():
    """Получение списка всех принтеров"""
    return jsonify(printer_manager.printers)

@app.route('/api/printers', methods=['POST'])
def add_printer():
    """Добавление нового принтера"""
    data = request.json
    printer = printer_manager.add_printer(
        name=data['name'],
        ip_address=data['ip_address'],
        port=data.get('port', 7125)
    )
    return jsonify(printer)

@app.route('/api/printers/<printer_id>', methods=['DELETE'])
def remove_printer(printer_id):
    """Удаление принтера"""
    success = printer_manager.remove_printer(printer_id)
    return jsonify({'success': success})

@app.route('/api/printers/<printer_id>/status', methods=['GET'])
def get_printer_status(printer_id):
    """Получение статуса конкретного принтера"""
    printer = next((p for p in printer_manager.printers if p['id'] == printer_id), None)
    if not printer:
        return jsonify({'error': 'Принтер не найден'}), 404
    
    status = printer_manager.get_printer_status(printer)
    return jsonify(status)

@app.route('/api/printers/<printer_id>/upload', methods=['POST'])
def upload_file(printer_id):
    """Загрузка файла на принтер"""
    if 'file' not in request.files:
        return jsonify({'error': 'Файл не найден'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Файл не выбран'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'Неподдерживаемый тип файла'}), 400
    
    result = printer_manager.upload_file(printer_id, file)
    return jsonify(result)

@app.route('/api/printers/<printer_id>/print/start', methods=['POST'])
def start_print(printer_id):
    """Запуск печати"""
    data = request.json
    result = printer_manager.start_print(printer_id, data['filename'])
    return jsonify(result)

@app.route('/api/printers/<printer_id>/print/pause', methods=['POST'])
def pause_print(printer_id):
    """Пауза печати"""
    result = printer_manager.pause_print(printer_id)
    return jsonify(result)

@app.route('/api/printers/<printer_id>/print/resume', methods=['POST'])
def resume_print(printer_id):
    """Возобновление печати"""
    result = printer_manager.resume_print(printer_id)
    return jsonify(result)

@app.route('/api/printers/<printer_id>/print/cancel', methods=['POST'])
def cancel_print(printer_id):
    """Отмена печати"""
    result = printer_manager.cancel_print(printer_id)
    return jsonify(result)

@app.route('/api/printers/<printer_id>/light/toggle', methods=['POST'])
def toggle_light(printer_id):
    """Переключение подсветки"""
    result = printer_manager.toggle_light(printer_id)
    return jsonify(result)

@app.route('/api/printers/<printer_id>/files', methods=['GET'])
def get_printer_files(printer_id):
    """Получение списка файлов на принтере"""
    printer = next((p for p in printer_manager.printers if p['id'] == printer_id), None)
    if not printer:
        return jsonify({'error': 'Принтер не найден'}), 404
    
    try:
        response = requests.get(f"{printer['moonraker_url']}/server/files/list", timeout=10)
        if response.status_code == 200:
            return jsonify(response.json()['result'])
        else:
            return jsonify({'error': f'Ошибка получения файлов: {response.status_code}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# API для файлов
@app.route('/api/files', methods=['GET'])
def get_files():
    """Получение списка файлов"""
    files = load_files()
    return jsonify(files)

@app.route('/api/files', methods=['POST'])
def upload_system_file():
    """Загрузка файла в систему"""
    if 'file' not in request.files:
        return jsonify({'error': 'Файл не найден'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Файл не выбран'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'Неподдерживаемый тип файла'}), 400
    
    filename = secure_filename(file.filename)
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(file_path)
    
    # Получаем описание файла, если оно предоставлено
    description = request.form.get('description', '')
    
    # Добавляем информацию о файле в базу
    files = load_files()
    file_info = {
        'id': f"file-{len(files)+1:03d}",
        'name': filename,
        'path': file_path,
        'size': os.path.getsize(file_path),
        'type': filename.rsplit('.', 1)[1].lower() if '.' in filename else 'unknown',
        'description': description,
        'uploaded': datetime.now().isoformat(),
        'modified': datetime.now().isoformat()
    }
    files.append(file_info)
    save_files(files)
    
    return jsonify(file_info)

@app.route('/api/files/<file_id>', methods=['DELETE'])
def delete_file(file_id):
    """Удаление файла"""
    files = load_files()
    file_info = next((f for f in files if f['id'] == file_id), None)
    
    if not file_info:
        return jsonify({'error': 'Файл не найден'}), 404
    
    try:
        os.remove(file_info['path'])
        files = [f for f in files if f['id'] != file_id]
        save_files(files)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/files/<file_id>/download', methods=['GET'])
def download_file(file_id):
    """Скачивание файла"""
    files = load_files()
    file_info = next((f for f in files if f['id'] == file_id), None)
    
    if not file_info:
        return jsonify({'error': 'Файл не найден'}), 404
    
    return send_from_directory(UPLOAD_FOLDER, file_info['name'])

# API для заданий
@app.route('/api/jobs', methods=['GET'])
def get_jobs():
    """Получение списка заданий"""
    jobs = load_jobs()
    return jsonify(jobs)

@app.route('/api/jobs', methods=['POST'])
def create_job():
    """Создание нового задания"""
    data = request.json
    
    jobs = load_jobs()
    job = {
        'id': f"job-{len(jobs)+1:03d}",
        'name': data['name'],
        'filename': data['filename'],
        'quantity': data.get('quantity', 1),
        'priority': data.get('priority', 'normal'),
        'material': data.get('material', 'PLA'),
        'printers': data.get('printers', []),
        'status': 'pending',
        'progress': 0,
        'estimated_time': data.get('estimated_time', 'Неизвестно'),
        'created': datetime.now().isoformat(),
        'started': None,
        'completed': None,
        'current_file_index': 0,
        'files_printed': 0
    }
    
    jobs.append(job)
    save_jobs(jobs)
    return jsonify(job)

@app.route('/api/jobs/<job_id>', methods=['PUT'])
def update_job(job_id):
    """Обновление задания"""
    data = request.json
    jobs = load_jobs()
    
    job = next((j for j in jobs if j['id'] == job_id), None)
    if not job:
        return jsonify({'error': 'Задание не найдено'}), 404
    
    job.update(data)
    job['modified'] = datetime.now().isoformat()
    save_jobs(jobs)
    return jsonify(job)

@app.route('/api/jobs/<job_id>', methods=['DELETE'])
def delete_job(job_id):
    """Удаление задания"""
    jobs = load_jobs()
    jobs = [j for j in jobs if j['id'] != job_id]
    save_jobs(jobs)
    return jsonify({'success': True})

@app.route('/api/jobs/<job_id>/start', methods=['POST'])
def start_job(job_id):
    """Запуск задания"""
    jobs = load_jobs()
    job = next((j for j in jobs if j['id'] == job_id), None)
    
    if not job:
        return jsonify({'error': 'Задание не найдено'}), 404
    
    # Проверка доступности принтеров
    available_printers = []
    for printer_id in job['printers']:
        printer = next((p for p in printer_manager.printers if p['id'] == printer_id), None)
        if printer:
            status = printer_manager.get_printer_status(printer)
            if status.get('online') and status['print_stats'].get('state') == 'idle':
                available_printers.append(printer_id)
    
    if not available_printers:
        return jsonify({'error': 'Нет доступных принтеров'}), 400
    
    # Назначение задания принтерам
    for printer_id in available_printers:
        printer = next((p for p in printer_manager.printers if p['id'] == printer_id), None)
        if printer:
            # Получение файлов для печати
            response = requests.get(f"{printer['moonraker_url']}/server/files/list")
            files = response.json().get('result', [])
            gcode_files = [f for f in files if f['pathname'].endswith('.gcode')]
            
            if gcode_files:
                # Выбор файла для печати
                file_to_print = gcode_files[0]['pathname']
                # Запуск печати
                printer_manager.start_print(printer_id, file_to_print)
    
    job['status'] = 'running'
    job['started'] = datetime.now().isoformat()
    save_jobs(jobs)
    return jsonify(job)

@app.route('/api/jobs/<job_id>/pause', methods=['POST'])
def pause_job(job_id):
    """Пауза задания"""
    jobs = load_jobs()
    job = next((j for j in jobs if j['id'] == job_id), None)
    
    if not job:
        return jsonify({'error': 'Задание не найдено'}), 404
    
    # Пауза на всех принтерах
    for printer_id in job['printers']:
        printer_manager.pause_print(printer_id)
    
    job['status'] = 'paused'
    save_jobs(jobs)
    return jsonify(job)

@app.route('/api/jobs/<job_id>/cancel', methods=['POST'])
def cancel_job(job_id):
    """Отмена задания"""
    jobs = load_jobs()
    job = next((j for j in jobs if j['id'] == job_id), None)
    
    if not job:
        return jsonify({'error': 'Задание не найдено'}), 404
    
    # Отмена на всех принтерах
    for printer_id in job['printers']:
        printer_manager.cancel_print(printer_id)
    
    job['status'] = 'cancelled'
    save_jobs(jobs)
    return jsonify(job)

@app.route('/api/jobs/<job_id>/progress', methods=['POST'])
def update_job_progress(job_id):
    """Обновление прогресса задания"""
    data = request.json
    progress = data.get('progress')
    
    if progress is None:
        return jsonify({'error': 'Не указан прогресс'}), 400
    
    jobs = load_jobs()
    job = next((j for j in jobs if j['id'] == job_id), None)
    
    if not job:
        return jsonify({'error': 'Задание не найдено'}), 404
    
    job['progress'] = progress
    save_jobs(jobs)
    return jsonify(job)

# API для пользователей
@app.route('/api/users', methods=['GET'])
def get_users():
    """Получение списка пользователей"""
    users = load_users()
    return jsonify(users)

@app.route('/api/users', methods=['POST'])
def create_user():
    """Создание нового пользователя"""
    data = request.json
    
    users = load_users()
    user = {
        'id': f"user-{len(users)+1:03d}",
        'name': data['name'],
        'email': data['email'],
        'role': data.get('role', 'operator'),
        'created': datetime.now().isoformat()
    }
    
    users.append(user)
    save_users(users)
    return jsonify(user)

@app.route('/api/users/<user_id>', methods=['PUT'])
def update_user(user_id):
    """Обновление пользователя"""
    data = request.json
    users = load_users()
    
    user = next((u for u in users if u['id'] == user_id), None)
    if not user:
        return jsonify({'error': 'Пользователь не найден'}), 404
    
    user.update(data)
    save_users(users)
    return jsonify(user)

@app.route('/api/users/<user_id>', methods=['DELETE'])
def delete_user(user_id):
    """Удаление пользователя"""
    users = load_users()
    users = [u for u in users if u['id'] != user_id]
    save_users(users)
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(
        debug=app.config['DEBUG'], 
        host=app.config['HOST'], 
        port=app.config['PORT']
    )
