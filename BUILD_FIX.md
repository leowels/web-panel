# ✅ Исправление ошибки сборки

## Проблема
```
Type error: Property 'map' does not exist on type 'never'.
./store/notificationStore.ts:27:28
```

## Причина
TypeScript не мог правильно определить тип `message` в функции `addNotification`, потому что в интерфейсе было указано только `string`, но в коде обрабатывались также массивы и объекты.

## Решение
Изменена типизация параметра `message` в интерфейсе `NotificationStore`:

**Было:**
```typescript
addNotification: (message: string, type?: NotificationType) => void
```

**Стало:**
```typescript
addNotification: (message: string | unknown[] | object | unknown, type?: NotificationType) => void
```

Теперь TypeScript правильно понимает, что после проверки `Array.isArray(message)` переменная действительно является массивом.

## Статус
✅ **ИСПРАВЛЕНО** - сборка должна проходить успешно.


