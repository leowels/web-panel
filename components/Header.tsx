'use client'

import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'

interface HeaderProps {
  user: any
  onAIClick: () => void
}

export default function Header({ user, onAIClick }: HeaderProps) {
  const router = useRouter()
  const { logout } = useAuthStore()

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  return (
    <header className="bg-white border-b border-gray-200 shadow-soft sticky top-0 z-30">
      <div className="px-4 sm:px-6">
        <div className="py-4 flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-primary-700 to-primary-900 rounded-xl flex items-center justify-center shadow-medium">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <span className="text-xl font-bold text-gray-900 tracking-tight block">InspectorHub</span>
              <p className="text-xs sm:text-sm text-gray-500 font-medium">Система управления инспекциями</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 lg:gap-4">
            <button
              onClick={onAIClick}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 shadow-soft transition-all duration-200 w-full sm:w-auto"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              ИИ Помощник
            </button>

            <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 bg-gray-50 sm:bg-transparent px-3 py-3 sm:p-0 rounded-xl border border-gray-200 sm:border-none">
              <div className="text-left sm:text-right">
                <p className="text-sm font-semibold text-gray-900 truncate max-w-[180px] sm:max-w-none">
                  {user?.full_name || user?.username}
                </p>
                <p className="text-xs text-gray-500 font-medium truncate max-w-[200px] sm:max-w-none">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-lg text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Выход
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

