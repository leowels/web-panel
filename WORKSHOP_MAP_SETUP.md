# 🗺️ Настройка интерактивной карты цеха

## Что реализовано

✅ Создан компонент `WorkshopMap` с SVG картой  
✅ Создана страница `/workshop-map` для отображения карты  
✅ Добавлена ссылка в навигацию  
✅ Создана миграция для полей координат в БД  

## Что нужно сделать вручную

### 1. Добавить поля координат в модель Equipment

Откройте файл `backend/models.py` и найдите класс `Equipment` (около строки 82).

**Добавьте после строки:**
```python
installation_location = Column(String, nullable=True)  # Место установки
```

**Добавьте:**
```python
map_x = Column(Float, nullable=True)  # Координата X на карте цеха (0-100%)
map_y = Column(Float, nullable=True)  # Координата Y на карте цеха (0-100%)
```

**Итоговый фрагмент должен выглядеть так:**
```python
installation_location = Column(String, nullable=True)  # Место установки
map_x = Column(Float, nullable=True)  # Координата X на карте цеха (0-100%)
map_y = Column(Float, nullable=True)  # Координата Y на карте цеха (0-100%)
status = Column(String, default="active", index=True)  # active, inactive, archived
```

### 2. Добавить поля в схемы API

Откройте файл `backend/routers/equipment.py` и найдите классы:

#### EquipmentCreate (около строки 43)
**Добавьте после:**
```python
workshop: Optional[str] = None
```

**Добавьте:**
```python
map_x: Optional[float] = None  # Координата X на карте (0-100%)
map_y: Optional[float] = None  # Координата Y на карте (0-100%)
```

#### EquipmentUpdate (около строки 57)
**Добавьте после:**
```python
workshop: Optional[str] = None
```

**Добавьте:**
```python
map_x: Optional[float] = None  # Координата X на карте (0-100%)
map_y: Optional[float] = None  # Координата Y на карте (0-100%)
```

#### EquipmentResponse (около строки 66)
**Добавьте после:**
```python
workshop: Optional[str]
```

**Добавьте:**
```python
map_x: Optional[float]  # Координата X на карте (0-100%)
map_y: Optional[float]  # Координата Y на карте (0-100%)
```

### 3. Выполнить миграцию БД

Запустите миграцию для добавления полей в базу данных:

```bash
cd backend
python migrate_db.py
```

Или если используете Docker:
```bash
docker exec -it web-panel python /app/backend/migrate_db.py
```

### 4. Перезапустить backend

После изменений перезапустите backend, чтобы изменения вступили в силу.

## Использование

1. Откройте страницу **"Карта цеха"** в навигации
2. Выберите цех из выпадающего списка (или оставьте "Все цехи")
3. Наведите курсор на оборудование для краткой информации
4. Кликните на оборудование для подробной информации

## Настройка координат оборудования

Координаты задаются в процентах (0-100%):
- `map_x = 25` означает 25% от левого края карты
- `map_y = 50` означает 50% от верхнего края карты

Можно добавить поля координат в форму редактирования оборудования (`components/equipment/EquipmentForm.tsx`) для удобного редактирования.

## Кастомизация карты

Для изменения внешнего вида карты отредактируйте компонент `components/equipment/WorkshopMap.tsx`:
- Измените размеры SVG (viewBox="0 0 1000 600")
- Добавьте элементы цеха (стены, колонны, зоны)
- Измените цвета и стили оборудования
- Добавьте иконки для разных типов оборудования
