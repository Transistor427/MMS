#!/usr/bin/env python3
"""
WSGI entry point для F-CRM
Используется для запуска в продакшене с Gunicorn или uWSGI
"""

import os
from app import app

if __name__ == "__main__":
    app.run()
