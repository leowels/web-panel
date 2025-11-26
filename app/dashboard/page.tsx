'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'
import DashboardKPIs from '@/components/dashboard/DashboardKPIs'
import HealthMap from '@/components/dashboard/HealthMap'
import EventFeed from '@/components/dashboard/EventFeed'
import DashboardCharts from '@/components/dashboard/DashboardCharts'
import PTOCalendar from '@/components/dashboard/PTOCalendar'
import DefectsKanban from '@/components/dashboard/DefectsKanban'
import QuickActions from '@/components/dashboard/QuickActions'
import AIPanel from '@/components/dashboard/AIPanel'

export default function DashboardPage() {
  const router = useRouter()
  const { isAuthenticated, user, fetchUser } = useAuthStore()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    fetchUser()
    
    // Загрузка темы из localStorage
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (savedTheme) {
      setTheme(savedTheme)
    }
  }, [isAuthenticated, router, fetchUser])

  if (!isAuthenticated) {
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
          {/* Заголовок с переключателем темы */}
          <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className={`text-3xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                Дашборд инспектора
              </h1>
              <p className={`mt-2 font-semibold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                Мониторинг состояния ПС в реальном времени
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

          {/* KPI блоки */}
          <DashboardKPIs theme={theme} />

          {/* Основная сетка виджетов */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
            {/* Левая колонка */}
            <div className="lg:col-span-2 space-y-6">
              {/* Карта рисков ПС */}
              <HealthMap theme={theme} />

              {/* Графики */}
              <DashboardCharts theme={theme} />

              {/* Календарь ПТО/ЧТО */}
              <PTOCalendar theme={theme} />
            </div>

            {/* Правая колонка */}
            <div className="space-y-6">
              {/* Быстрые действия */}
              <QuickActions theme={theme} />

              {/* Лента событий */}
              <EventFeed theme={theme} />

              {/* AI-панель */}
              <AIPanel theme={theme} />
            </div>
          </div>

          {/* Панель задач/дефектов (Kanban) */}
          <div className="mt-6">
            <DefectsKanban theme={theme} />
          </div>
        </div>
      </div>
    </Layout>
  )
}
