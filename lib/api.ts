// Централизованная конфигурация API URL
// Для Docker/единого рантайма можно использовать относительный путь '' + rewrites.
// Для Netlify/Vercel (frontend отдельно от backend) нужно задать NEXT_PUBLIC_API_URL.

const isBrowser = typeof window !== 'undefined'
const publicApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim() || ''

// В браузере без NEXT_PUBLIC_API_URL остаемся на относительном пути (подходит для proxy/rewrite).
// На сервере fallback на localhost нужен для локального запуска backend рядом.
export const API_URL = isBrowser
  ? publicApiUrl
  : (publicApiUrl || 'http://localhost:8000')

export function assertApiUrlConfigured(): void {
  if (!isBrowser) return

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const isProduction = process.env.NODE_ENV === 'production'

  if (!publicApiUrl && isProduction && !isLocalhost) {
    throw new Error('API URL не настроен: задайте NEXT_PUBLIC_API_URL для frontend-деплоя (например, Vercel/Netlify).')
  }
}

