#!/usr/bin/env python3
"""
Скрипт для запуска FastAPI сервера
"""
import sys
import os
import logging
from datetime import datetime
from pathlib import Path

# Определяем пути до загрузки .env
backend_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(backend_dir)

# Загружаем переменные окружения из .env файла ДО настройки логирования
# Пробуем несколько возможных путей
env_paths = [
    os.path.join(backend_dir, ".env"),
    os.path.join(backend_dir, "ENV_BACKEND.txt"),
    os.path.join(parent_dir, ".env"),
]

try:
    from dotenv import load_dotenv
    loaded = False
    for env_path in env_paths:
        if os.path.exists(env_path):
            load_dotenv(env_path, override=False)  # override=False - не перезаписывать существующие переменные
            print(f"[INFO] Загружены переменные окружения из: {env_path}")
            loaded = True
            break
    if not loaded:
        print(f"[WARNING] Файлы с переменными окружения не найдены. Проверялись пути: {env_paths}")
        print(f"[INFO] SECRET_KEY из окружения: {'установлен' if os.getenv('SECRET_KEY') else 'НЕ установлен'}")
except ImportError:
    print("[WARNING] python-dotenv не установлен, переменные окружения не загружены из файла")

# Настройка логирования с временными метками
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

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
        # Выводим диагностическую информацию
        logger = logging.getLogger(__name__)
        logger.info(f"Текущая директория: {os.getcwd()}")
        logger.info(f"Содержимое директории: {os.listdir('.')}")
        logger.info(f"Python path: {sys.path}")
        
        # Проверяем, нужно ли включить reload (только для development)
        is_development = os.getenv("ENVIRONMENT", "development").lower() != "production"
        reload_enabled = is_development and os.getenv("RELOAD", "false").lower() == "true"
        
        # Импортируем app напрямую для надежности
        logger.info("Попытка импорта main...")
        try:
            from main import app
            logger.info("✓ Импорт main успешен")
        except ImportError as e:
            logger.error(f"✗ Ошибка импорта main: {e}")
            # Если не получилось, пробуем через sys.path
            import sys
            if backend_dir not in sys.path:
                sys.path.insert(0, backend_dir)
            logger.info(f"Обновленный Python path: {sys.path}")
            try:
                from main import app
                logger.info("✓ Импорт main успешен после обновления sys.path")
            except ImportError as e2:
                logger.error(f"✗ Критическая ошибка импорта: {e2}")
                import traceback
                traceback.print_exc()
                sys.exit(1)
        
        # Запускаем uvicorn с прямым объектом app
        logger.info(f"Запуск uvicorn на порту {os.getenv('PORT', '8000')}...")
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=int(os.getenv("PORT", "8000")),
            reload=reload_enabled,
            reload_dirs=[backend_dir] if reload_enabled else None
        )
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"✗ Критическая ошибка при запуске: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        os.chdir(original_dir)
