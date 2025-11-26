# Как запустить Backend

## Проблема
Ошибка `ECONNREFUSED 127.0.0.1:8000` означает, что backend не запущен или был остановлен.

## Решение

### Вариант 1: Запуск через терминал (рекомендуется)

1. **Откройте терминал в папке проекта**

2. **Перейдите в папку backend:**
   ```bash
   cd backend
   ```

3. **Активируйте виртуальное окружение (если есть):**
   ```bash
   # Windows
   venv\Scripts\activate
   
   # Linux/Mac
   source venv/bin/activate
   ```

4. **Запустите backend:**
   ```bash
   python run.py
   ```
   
   Или:
   ```bash
   python main.py
   ```

5. **Вы должны увидеть:**
   ```
   INFO:     Started server process
   INFO:     Waiting for application startup.
   INFO:     Application startup complete.
   INFO:     Uvicorn running on http://0.0.0.0:8000
   ```

### Вариант 2: Запуск через uvicorn напрямую

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Вариант 3: Запуск в фоновом режиме (Linux/Mac)

```bash
cd backend
nohup python run.py > backend.log 2>&1 &
```

Или с использованием `screen`:
```bash
screen -S backend
cd backend
python run.py
# Нажмите Ctrl+A, затем D для отсоединения
```

## Проверка работы

После запуска backend должен быть доступен на `http://localhost:8000`

Проверьте:
```bash
curl http://localhost:8000/api/health
# или
curl http://localhost:8000/
```

## Если backend падает сразу после запуска

1. **Проверьте логи** - в терминале будут видны ошибки
2. **Проверьте переменные окружения** - убедитесь, что `SECRET_KEY` установлен
3. **Проверьте базу данных** - убедитесь, что подключение к БД работает

## Для разработки (с автоперезагрузкой)

```bash
cd backend
RELOAD=true python run.py
```

## Остановка backend

Нажмите `Ctrl+C` в терминале, где запущен backend.

Если запущен в фоне, найдите процесс:
```bash
# Linux/Mac
ps aux | grep "python run.py"
kill <PID>

# Windows
tasklist | findstr python
taskkill /PID <PID> /F
```



