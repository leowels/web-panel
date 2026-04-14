'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'
import OperationsDashboard from '@/components/dashboard/OperationsDashboard'
import { isManagerOnly } from '@/utils/roles'
import { useAuthHydrated } from '@/store/useAuthHydrated'

export default function DashboardPage() {
  const router = useRouter()
  const { isAuthenticated, user, fetchUser } = useAuthStore()
  const hydrated = useAuthHydrated()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const isManager = isManagerOnly(user)

  useEffect(() => {
    if (!hydrated) return
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    fetchUser()
    
    // Р—Р°РіСЂСѓР·РєР° С‚РµРјС‹ РёР· localStorage
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (savedTheme) {
      setTheme(savedTheme)
    }
  }, [hydrated, isAuthenticated, router, fetchUser])

  if (!hydrated || !isAuthenticated) {
    return null
  }

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
  }

  return (
    <Layout>
      <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="p-6">
          <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className={`text-3xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {isManager ? 'Дашборд менеджера' : 'Дашборд инспектора'}
              </h1>
              <p className={`mt-2 font-semibold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                {isManager
                  ? 'KPI и риски по подъемным сооружениям'
                  : 'Мониторинг состояния ПС в реальном времени'}
              </p>
            </div>
            <button
              onClick={toggleTheme}
              className={`p-3 rounded-lg shadow-soft transition-all duration-200 ${
                theme === 'dark' 
                  ? 'bg-gray-800 text-yellow-400 hover:bg-gray-700' 
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              {theme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>

          <OperationsDashboard theme={theme} isManager={isManager} />
        </div>
      </div>
    </Layout>
  )
}





