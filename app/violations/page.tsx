'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import Layout from '@/components/Layout'
import ViolationsTable from '@/components/violations/ViolationsTable'
import ViolationForm from '@/components/violations/ViolationForm'

const API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || ''
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function ViolationsPageContent() {
  const { isAuthenticated, token } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const searchParams = useSearchParams()
  const [showForm, setShowForm] = useState(false)
  const [selectedViolation, setSelectedViolation] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [prefillEquipmentId, setPrefillEquipmentId] = useState<number | null>(null)

  const triggerRefresh = () => setRefreshKey((prev) => prev + 1)

  useEffect(() => {
    const eqIdRaw = searchParams.get('equipment_id')
    const eqId = eqIdRaw ? Number(eqIdRaw) : null
    if (eqId && !Number.isNaN(eqId)) {
      setPrefillEquipmentId(eqId)
      setSelectedViolation(null)
      setShowForm(true)
    }
  }, [searchParams])

  if (!isAuthenticated) {
    return null
  }

  return (
    <Layout>
      <div className="p-4 sm:p-6">
        <div className="max-w-full mx-auto">
          <div className="mb-4 sm:mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Нарушения</h1>
              <p className="text-gray-600 mt-1">Управление нарушениями</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <button
                onClick={async () => {
                  if (!token) {
                    addNotification('Ошибка авторизации', 'error')
                    return
                  }
                  try {
                    const response = await axios.get(`${API_URL}/api/violations/export`, {
                      headers: { Authorization: `Bearer ${token}` },
                      responseType: 'blob',
                    })
                    const url = window.URL.createObjectURL(new Blob([response.data]))
                    const link = document.createElement('a')
                    link.href = url
                    link.download = `violations_${new Date().toISOString().slice(0, 10)}.csv`
                    document.body.appendChild(link)
                    link.click()
                    link.remove()
                    addNotification('Экспорт нарушений подготовлен', 'success')
                  } catch (error: any) {
                    const detail = error.response?.data?.detail || error.message || 'Ошибка экспорта'
                    addNotification(typeof detail === 'string' ? detail : JSON.stringify(detail), 'error')
                  }
                }}
                className="inline-flex items-center justify-center px-4 py-2 border border-blue-200 text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100 w-full sm:w-auto"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8m-8 4h8m-8 4h5" />
                </svg>
                Экспорт CSV
              </button>
              <button
                onClick={() => {
                  setSelectedViolation(null)
                  setShowForm(true)
                }}
                className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 w-full sm:w-auto"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Создать нарушение
              </button>
            </div>
          </div>

          <ViolationsTable
            onEdit={(id) => {
              setSelectedViolation(id)
              setShowForm(true)
            }}
            onView={(id) => {
              setSelectedViolation(id)
              setShowForm(true)
            }}
            refreshKey={refreshKey}
          />

          {showForm && (
            <ViolationForm
              violationId={selectedViolation}
              initialEquipmentId={prefillEquipmentId}
              onClose={() => {
                setShowForm(false)
                setSelectedViolation(null)
              }}
              onSuccess={() => {
                setShowForm(false)
                setSelectedViolation(null)
                triggerRefresh()
              }}
            />
          )}
        </div>
      </div>
    </Layout>
  )
}

export default function ViolationsPage() {
  return (
    <Suspense fallback={null}>
      <ViolationsPageContent />
    </Suspense>
  )
}
