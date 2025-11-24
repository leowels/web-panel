"""
Простая система кэширования для часто используемых данных
Использует in-memory кэш с TTL (Time To Live)
"""
from typing import Any, Optional
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

class CacheItem:
    def __init__(self, value: Any, ttl_seconds: int = 300):
        self.value = value
        self.expires_at = datetime.utcnow() + timedelta(seconds=ttl_seconds)

    def is_expired(self) -> bool:
        return datetime.utcnow() > self.expires_at


class SimpleCache:
    """
    Простой in-memory кэш с поддержкой TTL
    """
    def __init__(self):
        self._cache: dict[str, CacheItem] = {}
        self._hits = 0
        self._misses = 0

    def get(self, key: str) -> Optional[Any]:
        """Получить значение из кэша"""
        if key in self._cache:
            item = self._cache[key]
            if not item.is_expired():
                self._hits += 1
                return item.value
            else:
                # Удаляем истекший элемент
                del self._cache[key]
        
        self._misses += 1
        return None

    def set(self, key: str, value: Any, ttl_seconds: int = 300) -> None:
        """Установить значение в кэш"""
        self._cache[key] = CacheItem(value, ttl_seconds)

    def delete(self, key: str) -> None:
        """Удалить значение из кэша"""
        if key in self._cache:
            del self._cache[key]

    def clear(self) -> None:
        """Очистить весь кэш"""
        self._cache.clear()
        self._hits = 0
        self._misses = 0

    def cleanup_expired(self) -> None:
        """Удалить все истекшие элементы"""
        expired_keys = [
            key for key, item in self._cache.items()
            if item.is_expired()
        ]
        for key in expired_keys:
            del self._cache[key]

    def get_stats(self) -> dict:
        """Получить статистику кэша"""
        self.cleanup_expired()
        total = self._hits + self._misses
        hit_rate = (self._hits / total * 100) if total > 0 else 0
        return {
            "size": len(self._cache),
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": f"{hit_rate:.2f}%"
        }


# Глобальный экземпляр кэша
cache = SimpleCache()

