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
        # Выводим диагностическую информацию
        print(f"Текущая директория: {os.getcwd()}")
        print(f"Содержимое директории: {os.listdir('.')}")
        print(f"Python path: {sys.path}")
        
        # Проверяем, нужно ли включить reload (только для development)
        is_development = os.getenv("ENVIRONMENT", "development").lower() != "production"
        reload_enabled = is_development and os.getenv("RELOAD", "false").lower() == "true"
        
        # Импортируем app напрямую для надежности
        print("Попытка импорта main...")
        try:
            from main import app
            print("✓ Импорт main успешен")
        except ImportError as e:
            print(f"✗ Ошибка импорта main: {e}")
            # Если не получилось, пробуем через sys.path
            import sys
            if backend_dir not in sys.path:
                sys.path.insert(0, backend_dir)
            print(f"Обновленный Python path: {sys.path}")
            try:
                from main import app
                print("✓ Импорт main успешен после обновления sys.path")
            except ImportError as e2:
                print(f"✗ Критическая ошибка импорта: {e2}")
                import traceback
                traceback.print_exc()
                sys.exit(1)
        
        # Запускаем uvicorn с прямым объектом app
        print(f"Запуск uvicorn на порту {os.getenv('PORT', '8000')}...")
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=int(os.getenv("PORT", "8000")),
            reload=reload_enabled,
            reload_dirs=[backend_dir] if reload_enabled else None
        )
    except Exception as e:
        print(f"✗ Критическая ошибка при запуске: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        os.chdir(original_dir)
