'use client'

import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'
import AuditLogTable from '@/components/audit/AuditLogTable'
import ErrorMonitoringTable from '@/components/audit/ErrorMonitoringTable'

type AuditTab = 'audit-log' | 'errors'

export default function AuditPage() {
  const { isAuthenticated } = useAuthStore()
  const [activeTab, setActiveTab] = useState<AuditTab>('audit-log')

  if (!isAuthenticated) {
    return null
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Журнал аудита</h1>
            <p className="text-gray-600 mt-1">Лог действий и мониторинг системных ошибок</p>
          </div>

          <div className="mb-4 inline-flex rounded-lg border border-gray-200 p-1 bg-white">
            <button
              onClick={() => setActiveTab('audit-log')}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                activeTab === 'audit-log'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Действия пользователей
            </button>
            <button
              onClick={() => setActiveTab('errors')}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                activeTab === 'errors'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Мониторинг ошибок
            </button>
          </div>

          {activeTab === 'audit-log' ? <AuditLogTable /> : <ErrorMonitoringTable />}
        </div>
      </div>
    </Layout>
  )
}
