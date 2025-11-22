'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'
import UserSettings from '@/components/settings/UserSettings'
import SystemSettings from '@/components/settings/SystemSettings'

export default function SettingsPage() {
  const { isAuthenticated, user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'user' | 'system'>('user')

  if (!isAuthenticated) {
    return null
  }

  // Проверка прав на системные настройки
  const isAdmin = user?.roles?.some((r: any) => r.name === 'admin') || false

  return (
    <Layout>
      <div className="p-6">
        <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Настройки</h1>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <nav className="flex">
              <button
                onClick={() => setActiveTab('user')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'user'
                    ? 'border-b-2 border-primary-600 text-primary-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Настройки пользователя
              </button>
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('system')}
                  className={`px-6 py-3 text-sm font-medium ${
                    activeTab === 'system'
                      ? 'border-b-2 border-primary-600 text-primary-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Системные настройки
                </button>
              )}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'user' && <UserSettings />}
            {activeTab === 'system' && isAdmin && <SystemSettings />}
          </div>
        </div>
        </div>
      </div>
    </Layout>
  )
}

