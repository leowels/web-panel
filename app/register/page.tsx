'use client'

import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'

export default function RegisterPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()

  if (isAuthenticated) {
    router.push('/dashboard')
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-lg mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Регистрация отключена</h1>
          <p className="text-gray-600 mt-2">Создание пользователей выполняет администратор.</p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="w-full bg-primary-600 text-white py-2 px-4 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 font-semibold transition-colors"
          >
            Перейти ко входу
          </button>
          <p className="text-xs text-gray-500 text-center">
            Если нужен доступ, обратитесь к администратору.
          </p>
        </div>
      </div>
    </div>
  )
}
