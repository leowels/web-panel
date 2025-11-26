// Централизованная конфигурация API URL
// В браузере используем относительный путь для прокси Next.js
// На сервере используем localhost:8000

export const API_URL = 
  typeof window !== 'undefined' 
    ? (process.env.NEXT_PUBLIC_API_URL || '') // В браузере - относительный путь
    : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'); // На сервере - полный URL



