import os
from dotenv import load_dotenv

# Загрузка переменных окружения
load_dotenv()

class Config:
    """Конфигурация приложения"""
    
    # Основные настройки
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    DEBUG = os.environ.get('FLASK_DEBUG', 'True').lower() == 'true'
    
    # Настройки сервера
    HOST = os.environ.get('HOST', '0.0.0.0')
    PORT = int(os.environ.get('PORT', 5000))
    
    # Настройки файлов
    UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', 'uploads')
    MAX_CONTENT_LENGTH = int(os.environ.get('MAX_CONTENT_LENGTH', 100 * 1024 * 1024))  # 100MB
    ALLOWED_EXTENSIONS = {'gcode', 'g', 'gco', 'gcode.gz', 'ufp', '3mf'}
    
    # Настройки базы данных
    PRINTERS_FILE = os.environ.get('PRINTERS_FILE', 'printers.json')
    PRINT_JOBS_FILE = os.environ.get('PRINT_JOBS_FILE', 'print_jobs.json')
    
    # Настройки Moonraker
    MOONRAKER_DEFAULT_PORT = int(os.environ.get('MOONRAKER_DEFAULT_PORT', 7125))
    WEBCAM_DEFAULT_PORT = int(os.environ.get('WEBCAM_DEFAULT_PORT', 8080))
    
    # Настройки обновления статуса
    STATUS_UPDATE_INTERVAL = int(os.environ.get('STATUS_UPDATE_INTERVAL', 5))  # секунды
    REQUEST_TIMEOUT = int(os.environ.get('REQUEST_TIMEOUT', 10))  # секунды
    
    # Настройки логирования
    LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')
    LOG_FILE = os.environ.get('LOG_FILE', 'f-crm.log')
    
    # Настройки безопасности
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*').split(',')
    
    @staticmethod
    def init_app(app):
        """Инициализация конфигурации для приложения"""
        # Создание необходимых папок
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        
        # Настройка логирования
        import logging
        from logging.handlers import RotatingFileHandler
        
        if not app.debug:
            if not os.path.exists('logs'):
                os.mkdir('logs')
            file_handler = RotatingFileHandler(
                Config.LOG_FILE, 
                maxBytes=10240000, 
                backupCount=10
            )
            file_handler.setFormatter(logging.Formatter(
                '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
            ))
            file_handler.setLevel(logging.INFO)
            app.logger.addHandler(file_handler)
            
            app.logger.setLevel(logging.INFO)
            app.logger.info('F-CRM startup')

class DevelopmentConfig(Config):
    """Конфигурация для разработки"""
    DEBUG = True
    LOG_LEVEL = 'DEBUG'

class ProductionConfig(Config):
    """Конфигурация для продакшена"""
    DEBUG = False
    LOG_LEVEL = 'WARNING'
    
    @classmethod
    def init_app(cls, app):
        Config.init_app(app)
        
        # Дополнительные настройки для продакшена
        import logging
        from logging import StreamHandler
        stream_handler = StreamHandler()
        stream_handler.setLevel(logging.INFO)
        app.logger.addHandler(stream_handler)

class TestingConfig(Config):
    """Конфигурация для тестирования"""
    TESTING = True
    DEBUG = True
    PRINTERS_FILE = 'test_printers.json'
    PRINT_JOBS_FILE = 'test_print_jobs.json'

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}
