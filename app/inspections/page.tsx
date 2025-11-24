'use client'

import { useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import Layout from '@/components/Layout'
import InspectionsTable from '@/components/inspections/InspectionsTable'
import InspectionWizard from '@/components/inspections/InspectionWizard'

const API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || ''
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function InspectionsPage() {
  const { isAuthenticated, token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const [showWizard, setShowWizard] = useState(false)
  const [selectedInspection, setSelectedInspection] = useState<number | null>(null)

  if (!isAuthenticated) {
    return null
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Осмотры</h1>
            <p className="text-gray-600 mt-1">Проведение осмотров оборудования</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={async () => {
                if (!token) {
                  addNotification('Ошибка авторизации', 'error')
                  return
                }
                try {
                  const response = await axios.get(`${API_URL}/api/inspections/export`, {
                    headers: { Authorization: `Bearer ${token}` },
                    responseType: 'blob',
                  })
                  const url = window.URL.createObjectURL(new Blob([response.data]))
                  const link = document.createElement('a')
                  link.href = url
                  link.download = `inspections_${new Date().toISOString().slice(0, 10)}.csv`
                  document.body.appendChild(link)
                  link.click()
                  link.remove()
                  addNotification('Экспорт осмотров подготовлен', 'success')
                } catch (error: any) {
                  const detail = error.response?.data?.detail || error.message || 'Ошибка экспорта'
                  addNotification(typeof detail === 'string' ? detail : JSON.stringify(detail), 'error')
                }
              }}
              className="inline-flex items-center justify-center px-4 py-2 border border-blue-200 text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8m-8 4h8m-8 4h5" />
              </svg>
              Экспорт CSV
            </button>
            <button
              onClick={() => {
                setSelectedInspection(null)
                setShowWizard(true)
              }}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Начать осмотр
            </button>
          </div>
        </div>

        <InspectionsTable
          onView={(id) => {
            setSelectedInspection(id)
            setShowWizard(true)
          }}
        />

        {showWizard && (
          <InspectionWizard
            inspectionId={selectedInspection}
            onClose={() => {
              setShowWizard(false)
              setSelectedInspection(null)
            }}
            onSuccess={() => {
              setShowWizard(false)
              setSelectedInspection(null)
            }}
          />
        )}
        </div>
      </div>
    </Layout>
  )
}

