'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'
import ActsTable from '@/components/acts/ActsTable'
import ActForm from '@/components/acts/ActForm'

function ActsPageContent() {
  const { isAuthenticated } = useAuthStore()
  const searchParams = useSearchParams()
  const [showForm, setShowForm] = useState(false)
  const [selectedAct, setSelectedAct] = useState<number | null>(null)
  const [prefillEquipmentId, setPrefillEquipmentId] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const actIdRaw = searchParams.get('act_id')
    const actId = actIdRaw ? Number(actIdRaw) : null
    if (actId && !Number.isNaN(actId)) {
      setSelectedAct(actId)
      setShowForm(true)
      return
    }

    const eqIdRaw = searchParams.get('equipment_id')
    const eqId = eqIdRaw ? Number(eqIdRaw) : null
    if (eqId && !Number.isNaN(eqId)) {
      setPrefillEquipmentId(eqId)
      setSelectedAct(null)
      setShowForm(true)
    }
  }, [searchParams])

  if (!isAuthenticated) {
    return null
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Акты и предписания</h1>
              <p className="text-gray-600 mt-1">Управление актами проверок</p>
            </div>
            <button
              onClick={() => {
                setSelectedAct(null)
                setShowForm(true)
              }}
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 w-full sm:w-auto"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Создать акт
            </button>
          </div>

          <ActsTable
            onEdit={(id) => {
              setSelectedAct(id)
              setShowForm(true)
            }}
            onView={(id) => {
              setSelectedAct(id)
              setShowForm(true)
            }}
            refreshKey={refreshKey}
          />

          {showForm && (
            <ActForm
              actId={selectedAct}
              prefillEquipmentId={prefillEquipmentId}
              onClose={() => {
                setShowForm(false)
                setSelectedAct(null)
              }}
              onSuccess={() => {
                setShowForm(false)
                setSelectedAct(null)
                setRefreshKey((prev) => prev + 1)
              }}
            />
          )}
        </div>
      </div>
    </Layout>
  )
}

export default function ActsPage() {
  return (
    <Suspense fallback={null}>
      <ActsPageContent />
    </Suspense>
  )
}
