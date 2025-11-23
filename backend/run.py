#!/usr/bin/env python3
"""
Скрипт для запуска FastAPI сервера
"""
import sys
import os

# Добавляем родительскую директорию в путь для абсолютных импортов
backend_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(backend_dir)

# Добавляем пути в sys.path
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import uvicorn

if __name__ == "__main__":
    # Меняем рабочую директорию на backend
    original_dir = os.getcwd()
    os.chdir(backend_dir)
    
    try:
        # Проверяем, нужно ли включить reload (только для development)
        is_development = os.getenv("ENVIRONMENT", "development").lower() != "production"
        reload_enabled = is_development and os.getenv("RELOAD", "false").lower() == "true"
        
        # Импортируем app напрямую для надежности
        try:
            from main import app
        except ImportError:
            # Если не получилось, пробуем через sys.path
            import sys
            if backend_dir not in sys.path:
                sys.path.insert(0, backend_dir)
            from main import app
        
        # Запускаем uvicorn с прямым объектом app
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=int(os.getenv("PORT", "8000")),
            reload=reload_enabled,
            reload_dirs=[backend_dir] if reload_enabled else None
        )
    finally:
        os.chdir(original_dir)
